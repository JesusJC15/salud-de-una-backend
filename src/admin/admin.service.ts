import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { DoctorStatus } from '../common/enums/doctor-status.enum';
import { Specialty } from '../common/enums/specialty.enum';
import { RequestUser } from '../common/interfaces/request-user.interface';
import { Doctor, DoctorDocument } from '../doctors/schemas/doctor.schema';
import {
  RethusVerification,
  RethusVerificationDocument,
} from '../doctors/schemas/rethus-verification.schema';
import { OutboxDispatcherService } from '../outbox/outbox-dispatcher.service';
import { OutboxService } from '../outbox/outbox.service';
import { ListDoctorsForReviewDto } from './dto/list-doctors-for-review.dto';
import { RethusVerifyDto } from './dto/rethus-verify.dto';
import { RethusState } from '../common/enums/rethus-state.enum';

@Injectable()
export class AdminService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Doctor.name)
    private readonly doctorModel: Model<DoctorDocument>,
    @InjectModel(RethusVerification.name)
    private readonly rethusVerificationModel: Model<RethusVerificationDocument>,
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
    dto: RethusVerifyDto,
    actor: RequestUser,
    correlationId?: string,
  ) {
    if (!Types.ObjectId.isValid(doctorId)) {
      throw new BadRequestException('doctorId inválido');
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

  private async executeVerification(
    doctorId: string,
    dto: RethusVerifyDto,
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

    const checkedAt = new Date();
    const verification = await this.rethusVerificationModel.create(
      [
        {
          doctorId: doctor._id,
          programType: dto.programType,
          titleObtainingOrigin: dto.titleObtainingOrigin,
          professionOccupation: dto.professionOccupation,
          startDate: new Date(dto.startDate),
          rethusState: dto.rethusState,
          administrativeAct: dto.administrativeAct,
          reportingEntity: dto.reportingEntity,
          checkedBy: actor.email,
          checkedAt,
          evidenceUrl: dto.evidenceUrl,
          notes: dto.notes,
        },
      ],
      { session },
    );

    switch (dto.rethusState) {
      case RethusState.VALID:
        doctor.doctorStatus = DoctorStatus.VERIFIED;
        break;

      case RethusState.EXPIRED:
        doctor.doctorStatus = DoctorStatus.REJECTED;
        break;

      case RethusState.PENDING:
        doctor.doctorStatus = DoctorStatus.PENDING;
        break;
    }
    doctor.rethusVerification = verification[0]._id;
    await doctor.save({ session });

    await this.outboxService.createDoctorVerificationChangedEvent(
      {
        doctorId: doctor.id,
        doctorStatus: doctor.doctorStatus,
        notes: dto.notes,
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
}
