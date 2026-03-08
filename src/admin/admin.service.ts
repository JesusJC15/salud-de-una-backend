import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { RequestUser } from '../common/interfaces/request-user.interface';
import { Doctor, DoctorDocument } from '../doctors/schemas/doctor.schema';
import {
  RethusVerification,
  RethusVerificationDocument,
} from '../doctors/schemas/rethus-verification.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { RethusVerifyDto } from './dto/rethus-verify.dto';

@Injectable()
export class AdminService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Doctor.name)
    private readonly doctorModel: Model<DoctorDocument>,
    @InjectModel(RethusVerification.name)
    private readonly rethusVerificationModel: Model<RethusVerificationDocument>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async verifyDoctor(
    doctorId: string,
    dto: RethusVerifyDto,
    actor: RequestUser,
  ) {
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
        };
      } | null = null;
      await session.withTransaction(async () => {
        response = await this.executeVerification(
          doctorId,
          dto,
          actor,
          session,
        );
      });

      if (!response) {
        throw new InternalServerErrorException(
          'Error interno al actualizar verificacion; sin cambios aplicados',
        );
      }
      return response;
    } catch (error) {
      if (error instanceof NotFoundException) {
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
          doctorId: new Types.ObjectId(doctorId),
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

    doctor.rethusVerification = verification[0]._id;
    await doctor.save({ session });

    await this.notificationsService.createDoctorStatusChange(
      doctor.id,
      doctor.doctorStatus,
      dto.notes,
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
      },
    };
  }
}
