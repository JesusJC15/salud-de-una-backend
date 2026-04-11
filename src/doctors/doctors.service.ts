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
import { ProgramType } from '../common/enums/program-type.enum';
import { RethusState } from '../common/enums/rethus-state.enum';
import { TitleObtainingOrigin } from '../common/enums/title-obtaining-origin.enum';
import { RequestUser } from '../common/interfaces/request-user.interface';
import { OutboxDispatcherService } from '../outbox/outbox-dispatcher.service';
import { OutboxService } from '../outbox/outbox.service';
import { DoctorMeResponseDto } from './dto/doctor-me.response.dto';
import { RethusResubmitDto } from './dto/rethus-resubmit.dto';
import { Doctor, DoctorDocument } from './schemas/doctor.schema';
import {
  RethusVerification,
  RethusVerificationDocument,
} from './schemas/rethus-verification.schema';

const DEFAULT_RESUBMIT_VERIFICATION = {
  programType: ProgramType.UNDEFINED,
  titleObtainingOrigin: TitleObtainingOrigin.LOCAL,
  professionOccupation: 'PENDIENTE DE ACTUALIZACION',
  startDate: new Date('1970-01-01T00:00:00.000Z'),
  administrativeAct: 'N/A',
  reportingEntity: 'N/A',
} as const;

@Injectable()
export class DoctorsService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Doctor.name)
    private readonly doctorModel: Model<DoctorDocument>,
    @InjectModel(RethusVerification.name)
    private readonly rethusVerificationModel: Model<RethusVerificationDocument>,
    private readonly outboxService: OutboxService,
    private readonly outboxDispatcherService: OutboxDispatcherService,
  ) {}

  async getMe(user: RequestUser): Promise<DoctorMeResponseDto> {
    const doctor = await this.doctorModel
      .findById(user.userId)
      .select('firstName lastName email role specialty doctorStatus')
      .lean()
      .exec();

    if (!doctor) {
      throw new NotFoundException('Medico no encontrado');
    }

    const verification = await this.rethusVerificationModel
      .findOne({ doctorId: new Types.ObjectId(user.userId) })
      .sort({ checkedAt: -1 })
      .select(
        'programType titleObtainingOrigin professionOccupation startDate rethusState administrativeAct reportingEntity checkedAt checkedBy evidenceUrl notes',
      )
      .lean()
      .exec();

    return {
      id: doctor._id.toString(),
      firstName: doctor.firstName,
      lastName: doctor.lastName,
      email: doctor.email,
      role: doctor.role,
      specialty: doctor.specialty,
      doctorStatus: doctor.doctorStatus,
      verification: verification
        ? {
            programType: verification.programType,
            titleObtainingOrigin: verification.titleObtainingOrigin,
            professionOccupation: verification.professionOccupation,
            startDate: verification.startDate,
            rethusState: verification.rethusState,
            administrativeAct: verification.administrativeAct,
            reportingEntity: verification.reportingEntity,
            checkedAt: verification.checkedAt,
            checkedBy: verification.checkedBy,
            evidenceUrl: verification.evidenceUrl,
            notes: verification.notes,
          }
        : null,
    };
  }

  async rethusResubmit(
    user: RequestUser,
    dto: RethusResubmitDto,
    correlationId?: string,
  ) {
    if (!Types.ObjectId.isValid(user.userId)) {
      throw new BadRequestException('doctorId invalido');
    }

    const session = await this.connection.startSession();
    try {
      let response: {
        doctorId: string;
        doctorStatus: DoctorStatus;
        checkedAt: Date;
        verification: {
          rethusState: RethusState;
          checkedBy: string;
          evidenceUrl?: string;
          notes?: string;
        };
      } | null = null;

      await session.withTransaction(async () => {
        response = await this.executeRethusResubmit(
          user,
          dto,
          correlationId,
          session,
        );
      });

      if (!response) {
        throw new InternalServerErrorException(
          'Error interno al reenviar verificacion; sin cambios aplicados',
        );
      }

      await this.outboxDispatcherService.dispatchPendingEvents();
      return response;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Error interno al reenviar verificacion; sin cambios aplicados',
      );
    } finally {
      await session.endSession();
    }
  }

  private async executeRethusResubmit(
    user: RequestUser,
    dto: RethusResubmitDto,
    correlationId: string | undefined,
    session: ClientSession,
  ) {
    const doctor = await this.doctorModel
      .findById(user.userId)
      .session(session)
      .exec();
    if (!doctor) {
      throw new NotFoundException('Medico no encontrado');
    }

    if (doctor.doctorStatus !== DoctorStatus.REJECTED) {
      throw new BadRequestException(
        'Solo medicos en estado REJECTED pueden reenviar evidencia REThUS',
      );
    }

    const latestVerification = await this.rethusVerificationModel
      .findOne({ doctorId: doctor._id })
      .sort({ checkedAt: -1 })
      .session(session)
      .lean()
      .exec();

    const checkedAt = new Date();
    const verification = await this.rethusVerificationModel.create(
      [
        {
          doctorId: doctor._id,
          programType:
            latestVerification?.programType ??
            DEFAULT_RESUBMIT_VERIFICATION.programType,
          titleObtainingOrigin:
            latestVerification?.titleObtainingOrigin ??
            DEFAULT_RESUBMIT_VERIFICATION.titleObtainingOrigin,
          professionOccupation:
            latestVerification?.professionOccupation ??
            DEFAULT_RESUBMIT_VERIFICATION.professionOccupation,
          startDate:
            latestVerification?.startDate ??
            DEFAULT_RESUBMIT_VERIFICATION.startDate,
          rethusState: RethusState.PENDING,
          administrativeAct:
            latestVerification?.administrativeAct ??
            DEFAULT_RESUBMIT_VERIFICATION.administrativeAct,
          reportingEntity:
            latestVerification?.reportingEntity ??
            DEFAULT_RESUBMIT_VERIFICATION.reportingEntity,
          checkedBy: user.email,
          checkedAt,
          evidenceUrl: dto.evidenceUrl,
          notes: dto.notes,
        },
      ],
      { session },
    );

    doctor.doctorStatus = DoctorStatus.PENDING;
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
        rethusState: verification[0].rethusState,
        checkedBy: verification[0].checkedBy,
        evidenceUrl: verification[0].evidenceUrl,
        notes: verification[0].notes,
      },
    };
  }
}
