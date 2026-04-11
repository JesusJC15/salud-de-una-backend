import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, PipelineStage, Types } from 'mongoose';
import { Admin, AdminDocument } from '../admins/schemas/admin.schema';
import {
  RefreshSession,
  RefreshSessionDocument,
} from '../auth/schemas/refresh-session.schema';
import { DoctorStatus } from '../common/enums/doctor-status.enum';
import { ProgramType } from '../common/enums/program-type.enum';
import { RethusState } from '../common/enums/rethus-state.enum';
import { Specialty } from '../common/enums/specialty.enum';
import { TitleObtainingOrigin } from '../common/enums/title-obtaining-origin.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { RequestUser } from '../common/interfaces/request-user.interface';
import { Doctor, DoctorDocument } from '../doctors/schemas/doctor.schema';
import {
  RethusVerification,
  RethusVerificationDocument,
} from '../doctors/schemas/rethus-verification.schema';
import { OutboxDispatcherService } from '../outbox/outbox-dispatcher.service';
import { OutboxService } from '../outbox/outbox.service';
import { Patient, PatientDocument } from '../patients/schemas/patient.schema';
import { ListDoctorsForReviewDto } from './dto/list-doctors-for-review.dto';
import { ListUsersDto } from './dto/list-users.dto';
import {
  RethusDecisionAction,
  RethusDecisionDto,
} from './dto/rethus-decision.dto';
import { RethusVerifyDto } from './dto/rethus-verify.dto';
import { UpdateUserActiveDto } from './dto/update-user-active.dto';

type VerificationPayload = {
  programType: ProgramType;
  titleObtainingOrigin: TitleObtainingOrigin;
  professionOccupation: string;
  startDate: Date;
  rethusState: RethusState;
  administrativeAct: string;
  reportingEntity: string;
  evidenceUrl?: string;
  notes?: string;
};

type UserListItem = {
  id: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  email: string;
  isActive: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
  specialty?: string;
  doctorStatus?: string;
  personalId?: string;
  professionalLicense?: string;
  phoneNumber?: string;
  birthDate?: Date | null;
  gender?: string;
};

type BaseUserProjection = {
  _id: Types.ObjectId;
  firstName: string;
  lastName: string;
  email: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};

type PatientProjection = BaseUserProjection & {
  birthDate?: Date | null;
  gender?: string;
};

type DoctorProjection = BaseUserProjection & {
  specialty?: string;
  doctorStatus?: string;
  personalId?: string;
  professionalLicense?: string;
  phoneNumber?: string;
};

type AdminProjection = BaseUserProjection;

type AggregatedUserProjection = BaseUserProjection & {
  role: UserRole;
  specialty?: string;
  doctorStatus?: string;
  personalId?: string;
  professionalLicense?: string;
  phoneNumber?: string;
  birthDate?: Date | null;
  gender?: string;
};

type UnionPipelineStage = Exclude<
  PipelineStage,
  PipelineStage.Merge | PipelineStage.Out | PipelineStage.UnionWith
>;

const DEFAULT_VERIFICATION_PAYLOAD = {
  programType: ProgramType.UNDEFINED,
  titleObtainingOrigin: TitleObtainingOrigin.LOCAL,
  professionOccupation: 'PENDIENTE DE ACTUALIZACION',
  startDate: new Date('1970-01-01T00:00:00.000Z'),
  administrativeAct: 'N/A',
  reportingEntity: 'N/A',
} as const;

@Injectable()
export class AdminService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Doctor.name)
    private readonly doctorModel: Model<DoctorDocument>,
    @InjectModel(RethusVerification.name)
    private readonly rethusVerificationModel: Model<RethusVerificationDocument>,
    @InjectModel(Patient.name)
    private readonly patientModel: Model<PatientDocument>,
    @InjectModel(Admin.name)
    private readonly adminModel: Model<AdminDocument>,
    @InjectModel(RefreshSession.name)
    private readonly refreshSessionModel: Model<RefreshSessionDocument>,
    private readonly outboxService: OutboxService,
    private readonly outboxDispatcherService: OutboxDispatcherService,
  ) {}

  async listDoctorsForReview(query: ListDoctorsForReviewDto) {
    const search = query.search?.trim();
    const doctorFilter: {
      doctorStatus?: DoctorStatus;
      specialty?: Specialty;
      $or?: Array<Record<string, unknown>>;
    } = {};

    if (query.status) {
      doctorFilter.doctorStatus = query.status;
    }

    if (query.specialty) {
      doctorFilter.specialty = query.specialty;
    }

    if (search) {
      const escapedSearch = search.replaceAll(
        /[.*+?^${}()|[\]\\]/g,
        String.raw`\$&`,
      );
      const searchRegex = new RegExp(escapedSearch, 'i');
      doctorFilter.$or = [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex },
        { personalId: searchRegex },
      ];
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [doctors, filteredCount] = await Promise.all([
      this.doctorModel
        .find(doctorFilter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select(
          'firstName lastName email specialty doctorStatus professionalLicense personalId phoneNumber createdAt updatedAt',
        )
        .lean()
        .exec(),
      this.doctorModel.countDocuments(doctorFilter),
    ]);

    const doctorIds = doctors.map((doctor) => doctor._id);
    const latestVerifications =
      doctorIds.length === 0
        ? []
        : await this.rethusVerificationModel
            .aggregate<{
              doctorId: Types.ObjectId;
              checkedAt: Date;
              checkedBy: string;
              rethusState: string;
              reportingEntity: string;
              notes?: string;
            }>([
              {
                $match: {
                  doctorId: { $in: doctorIds },
                },
              },
              {
                $sort: { checkedAt: -1 },
              },
              {
                $group: {
                  _id: '$doctorId',
                  doctorId: { $first: '$doctorId' },
                  checkedAt: { $first: '$checkedAt' },
                  checkedBy: { $first: '$checkedBy' },
                  rethusState: { $first: '$rethusState' },
                  reportingEntity: { $first: '$reportingEntity' },
                  notes: { $first: '$notes' },
                },
              },
            ])
            .exec();

    const verificationMap = new Map(
      latestVerifications.map((verification) => [
        verification.doctorId.toString(),
        verification,
      ]),
    );

    const statusSummary = await this.doctorModel
      .aggregate<{ _id: DoctorStatus | null; count: number }>([
        {
          $group: {
            _id: '$doctorStatus',
            count: { $sum: 1 },
          },
        },
      ])
      .exec();

    let pendingCount = 0;
    let verifiedCount = 0;
    let rejectedCount = 0;
    let totalCount = 0;

    for (const { _id, count } of statusSummary) {
      totalCount += count;
      if (_id === DoctorStatus.PENDING) {
        pendingCount = count;
      } else if (_id === DoctorStatus.VERIFIED) {
        verifiedCount = count;
      } else if (_id === DoctorStatus.REJECTED) {
        rejectedCount = count;
      }
    }
    return {
      summary: {
        total: totalCount,
        pending: pendingCount,
        verified: verifiedCount,
        rejected: rejectedCount,
      },
      pagination: {
        page,
        limit,
        total: filteredCount,
        totalPages: Math.ceil(filteredCount / limit),
      },
      items: doctors.map((doctor) => {
        const latestVerification = verificationMap.get(doctor._id.toString());
        return {
          id: doctor._id.toString(),
          firstName: doctor.firstName,
          lastName: doctor.lastName,
          email: doctor.email,
          specialty: doctor.specialty,
          doctorStatus: doctor.doctorStatus,
          professionalLicense: doctor.professionalLicense,
          personalId: doctor.personalId,
          phoneNumber: doctor.phoneNumber,
          createdAt: doctor.createdAt ?? null,
          updatedAt: doctor.updatedAt ?? null,
          latestVerification: latestVerification
            ? {
                checkedAt: latestVerification.checkedAt,
                checkedBy: latestVerification.checkedBy,
                rethusState: latestVerification.rethusState,
                reportingEntity: latestVerification.reportingEntity,
                notes: latestVerification.notes,
              }
            : null,
        };
      }),
    };
  }

  async verifyDoctor(
    doctorId: string,
    dto: RethusVerifyDto | RethusDecisionDto,
    actor: RequestUser,
    correlationId?: string,
  ) {
    if (!Types.ObjectId.isValid(doctorId)) {
      throw new BadRequestException('doctorId invalido');
    }

    const session = await this.connection.startSession();
    try {
      let response: {
        doctorId: string;
        doctorStatus: string;
        checkedAt: Date;
        verification: {
          programType: string;
          titleObtainingOrigin: string;
          professionOccupation: string;
          startDate: Date;
          rethusState: string;
          administrativeAct: string;
          reportingEntity: string;
          checkedBy: string;
          evidenceUrl?: string;
          notes?: string;
        };
      } | null = null;
      await session.withTransaction(async () => {
        response = await this.executeVerification(
          doctorId,
          dto,
          actor,
          correlationId,
          session,
        );
      });

      if (!response) {
        throw new InternalServerErrorException(
          'Error interno al actualizar verificacion; sin cambios aplicados',
        );
      }
      await this.outboxDispatcherService.dispatchPendingEvents();
      return response;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Error interno al actualizar verificacion; sin cambios aplicados',
      );
    } finally {
      await session.endSession();
    }
  }

  async listUsers(query: ListUsersDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const searchFilter = this.buildUserSearchFilter(query.search);

    if (query.role) {
      const [items, total] = await this.listUsersByRole(
        query.role,
        searchFilter,
        page,
        limit,
      );
      return {
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
        items,
      };
    }

    const [items, total] = await this.listUsersAcrossRoles(
      searchFilter,
      page,
      limit,
    );

    return {
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      items,
    };
  }

  async getUserByRole(role: UserRole, userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('userId invalido');
    }

    const user = await this.getUserByRoleFromCollection(role, userId);
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return this.mapUserByRole(role, user);
  }

  async updateUserActive(
    role: UserRole,
    userId: string,
    dto: UpdateUserActiveDto,
  ) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('userId invalido');
    }

    const user = await this.getUserDocumentByRole(role, userId);
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    user.isActive = dto.isActive;
    await user.save();

    if (!dto.isActive) {
      await this.refreshSessionModel
        .updateMany(
          {
            userId,
            role,
            revokedAt: { $exists: false },
          },
          {
            $set: {
              revokedAt: new Date(),
              revokedReason: 'admin_deactivated',
            },
          },
        )
        .exec();
    }

    return {
      id: user.id,
      role,
      isActive: user.isActive,
      updatedAt: new Date(),
    };
  }

  private async executeVerification(
    doctorId: string,
    dto: RethusVerifyDto | RethusDecisionDto,
    actor: RequestUser,
    correlationId: string | undefined,
    session: ClientSession,
  ) {
    const doctor = await this.doctorModel
      .findById(doctorId)
      .session(session)
      .exec();
    if (!doctor) {
      throw new NotFoundException('Medico no encontrado');
    }

    const latestVerification = await this.rethusVerificationModel
      .findOne({ doctorId: doctor._id })
      .sort({ checkedAt: -1 })
      .session(session)
      .lean()
      .exec();

    const normalizedPayload = this.normalizeVerificationPayload(
      dto,
      latestVerification,
    );

    const checkedAt = new Date();
    const verification = await this.rethusVerificationModel.create(
      [
        {
          doctorId: doctor._id,
          programType: normalizedPayload.programType,
          titleObtainingOrigin: normalizedPayload.titleObtainingOrigin,
          professionOccupation: normalizedPayload.professionOccupation,
          startDate: normalizedPayload.startDate,
          rethusState: normalizedPayload.rethusState,
          administrativeAct: normalizedPayload.administrativeAct,
          reportingEntity: normalizedPayload.reportingEntity,
          checkedBy: actor.email,
          checkedAt,
          evidenceUrl: normalizedPayload.evidenceUrl,
          notes: normalizedPayload.notes,
        },
      ],
      { session },
    );

    doctor.doctorStatus = this.mapStatusFromRethusState(
      normalizedPayload.rethusState,
    );
    doctor.rethusVerification = verification[0]._id;
    await doctor.save({ session });

    await this.outboxService.createDoctorVerificationChangedEvent(
      {
        doctorId: doctor.id,
        doctorStatus: doctor.doctorStatus,
        notes: normalizedPayload.notes,
      },
      correlationId,
      session,
    );

    return {
      doctorId: doctor.id,
      doctorStatus: doctor.doctorStatus,
      checkedAt,
      verification: {
        programType: verification[0].programType,
        titleObtainingOrigin: verification[0].titleObtainingOrigin,
        professionOccupation: verification[0].professionOccupation,
        startDate: verification[0].startDate,
        rethusState: verification[0].rethusState,
        administrativeAct: verification[0].administrativeAct,
        reportingEntity: verification[0].reportingEntity,
        checkedBy: verification[0].checkedBy,
        evidenceUrl: verification[0].evidenceUrl,
        notes: verification[0].notes,
      },
    };
  }

  private normalizeVerificationPayload(
    dto: RethusVerifyDto | RethusDecisionDto,
    latestVerification: RethusVerificationDocument | null,
  ): VerificationPayload {
    if (!this.isDecisionDto(dto)) {
      return {
        programType: dto.programType,
        titleObtainingOrigin: dto.titleObtainingOrigin,
        professionOccupation: dto.professionOccupation,
        startDate: new Date(dto.startDate),
        rethusState: dto.rethusState,
        administrativeAct: dto.administrativeAct,
        reportingEntity: dto.reportingEntity,
        evidenceUrl: dto.evidenceUrl,
        notes: dto.notes,
      };
    }

    const mappedState =
      dto.action === RethusDecisionAction.APPROVE
        ? RethusState.VALID
        : RethusState.EXPIRED;

    return {
      programType:
        latestVerification?.programType ??
        DEFAULT_VERIFICATION_PAYLOAD.programType,
      titleObtainingOrigin:
        latestVerification?.titleObtainingOrigin ??
        DEFAULT_VERIFICATION_PAYLOAD.titleObtainingOrigin,
      professionOccupation:
        latestVerification?.professionOccupation ??
        DEFAULT_VERIFICATION_PAYLOAD.professionOccupation,
      startDate:
        latestVerification?.startDate ?? DEFAULT_VERIFICATION_PAYLOAD.startDate,
      rethusState: mappedState,
      administrativeAct:
        latestVerification?.administrativeAct ??
        DEFAULT_VERIFICATION_PAYLOAD.administrativeAct,
      reportingEntity:
        latestVerification?.reportingEntity ??
        DEFAULT_VERIFICATION_PAYLOAD.reportingEntity,
      evidenceUrl: dto.evidenceUrl,
      notes: dto.notes,
    };
  }

  private isDecisionDto(
    dto: RethusVerifyDto | RethusDecisionDto,
  ): dto is RethusDecisionDto {
    return 'action' in dto;
  }

  private mapStatusFromRethusState(rethusState: RethusState): DoctorStatus {
    switch (rethusState) {
      case RethusState.VALID:
        return DoctorStatus.VERIFIED;
      case RethusState.EXPIRED:
        return DoctorStatus.REJECTED;
      case RethusState.PENDING:
        return DoctorStatus.PENDING;
      default:
        return DoctorStatus.PENDING;
    }
  }

  private buildUserSearchFilter(search?: string): Record<string, unknown> {
    const trimmedSearch = search?.trim();
    if (!trimmedSearch) {
      return {};
    }

    const escapedSearch = trimmedSearch.replaceAll(
      /[.*+?^${}()|[\]\\]/g,
      String.raw`\$&`,
    );
    const searchRegex = new RegExp(escapedSearch, 'i');

    return {
      $or: [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex },
      ],
    };
  }

  private async listUsersAcrossRoles(
    searchFilter: Record<string, unknown>,
    page: number,
    limit: number,
  ): Promise<[UserListItem[], number]> {
    const skip = (page - 1) * limit;
    const basePipeline = this.buildGlobalUsersPipeline(searchFilter);

    const [items, totalResult] = await Promise.all([
      this.patientModel
        .aggregate<AggregatedUserProjection>([
          ...basePipeline,
          { $sort: { createdAt: -1, _id: 1 } },
          { $skip: skip },
          { $limit: limit },
        ])
        .exec(),
      this.patientModel
        .aggregate<{ total?: number }>([...basePipeline, { $count: 'total' }])
        .exec(),
    ]);

    return [
      items.map((item) => this.mapUserByRole(item.role, item)),
      totalResult[0]?.total ?? 0,
    ];
  }

  private buildGlobalUsersPipeline(
    searchFilter: Record<string, unknown>,
  ): PipelineStage[] {
    const matchStage: UnionPipelineStage[] = Object.keys(searchFilter).length
      ? [{ $match: searchFilter }]
      : [];
    const doctorUnionPipeline: UnionPipelineStage[] = [
      ...matchStage,
      {
        $project: {
          _id: 1,
          firstName: 1,
          lastName: 1,
          email: 1,
          isActive: 1,
          createdAt: 1,
          updatedAt: 1,
          specialty: 1,
          doctorStatus: 1,
          personalId: 1,
          professionalLicense: 1,
          phoneNumber: 1,
          role: { $literal: UserRole.DOCTOR },
        },
      },
    ];
    const adminUnionPipeline: UnionPipelineStage[] = [
      ...matchStage,
      {
        $project: {
          _id: 1,
          firstName: 1,
          lastName: 1,
          email: 1,
          isActive: 1,
          createdAt: 1,
          updatedAt: 1,
          role: { $literal: UserRole.ADMIN },
        },
      },
    ];

    return [
      ...matchStage,
      {
        $project: {
          _id: 1,
          firstName: 1,
          lastName: 1,
          email: 1,
          isActive: 1,
          createdAt: 1,
          updatedAt: 1,
          birthDate: 1,
          gender: 1,
          role: { $literal: UserRole.PATIENT },
        },
      },
      {
        $unionWith: {
          coll: this.doctorModel.collection.name,
          pipeline: doctorUnionPipeline,
        },
      },
      {
        $unionWith: {
          coll: this.adminModel.collection.name,
          pipeline: adminUnionPipeline,
        },
      },
    ];
  }

  private async listUsersByRole(
    role: UserRole,
    searchFilter: Record<string, unknown>,
    page: number,
    limit: number,
  ): Promise<[UserListItem[], number]> {
    const skip = (page - 1) * limit;

    if (role === UserRole.PATIENT) {
      const [items, total] = await Promise.all([
        this.patientModel
          .find(searchFilter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean<PatientProjection[]>()
          .exec(),
        this.patientModel.countDocuments(searchFilter),
      ]);
      return [items.map((item) => this.mapPatientUser(item)), total];
    }

    if (role === UserRole.DOCTOR) {
      const [items, total] = await Promise.all([
        this.doctorModel
          .find(searchFilter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean<DoctorProjection[]>()
          .exec(),
        this.doctorModel.countDocuments(searchFilter),
      ]);
      return [items.map((item) => this.mapDoctorUser(item)), total];
    }

    const [items, total] = await Promise.all([
      this.adminModel
        .find(searchFilter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean<AdminProjection[]>()
        .exec(),
      this.adminModel.countDocuments(searchFilter),
    ]);
    return [items.map((item) => this.mapAdminUser(item)), total];
  }

  private async getUserByRoleFromCollection(
    role: UserRole,
    userId: string,
  ): Promise<PatientProjection | DoctorProjection | AdminProjection | null> {
    if (role === UserRole.PATIENT) {
      return this.patientModel
        .findById(userId)
        .lean<PatientProjection>()
        .exec();
    }
    if (role === UserRole.DOCTOR) {
      return this.doctorModel.findById(userId).lean<DoctorProjection>().exec();
    }
    return this.adminModel.findById(userId).lean<AdminProjection>().exec();
  }

  private async getUserDocumentByRole(role: UserRole, userId: string) {
    if (role === UserRole.PATIENT) {
      return this.patientModel.findById(userId).exec();
    }
    if (role === UserRole.DOCTOR) {
      return this.doctorModel.findById(userId).exec();
    }
    return this.adminModel.findById(userId).exec();
  }

  private mapUserByRole(
    role: UserRole,
    user: PatientProjection | DoctorProjection | AdminProjection,
  ): UserListItem {
    if (role === UserRole.DOCTOR) {
      return this.mapDoctorUser(user as DoctorProjection);
    }
    if (role === UserRole.PATIENT) {
      return this.mapPatientUser(user as PatientProjection);
    }
    return this.mapAdminUser(user as AdminProjection);
  }

  private mapBaseUser(role: UserRole, user: BaseUserProjection): UserListItem {
    return {
      id: user._id.toString(),
      role,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      isActive: user.isActive,
      createdAt: user.createdAt ?? null,
      updatedAt: user.updatedAt ?? null,
    };
  }

  private mapPatientUser(user: PatientProjection): UserListItem {
    return {
      ...this.mapBaseUser(UserRole.PATIENT, user),
      birthDate: user.birthDate ?? null,
      gender: user.gender,
    };
  }

  private mapDoctorUser(user: DoctorProjection): UserListItem {
    return {
      ...this.mapBaseUser(UserRole.DOCTOR, user),
      specialty: user.specialty,
      doctorStatus: user.doctorStatus,
      personalId: user.personalId,
      professionalLicense: user.professionalLicense,
      phoneNumber: user.phoneNumber,
    };
  }

  private mapAdminUser(user: AdminProjection): UserListItem {
    return this.mapBaseUser(UserRole.ADMIN, user);
  }
}
