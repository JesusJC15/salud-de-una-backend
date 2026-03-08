import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RequestUser } from '../common/interfaces/request-user.interface';
import { DoctorMeResponseDto } from './dto/doctor-me.response.dto';
import { Doctor, DoctorDocument } from './schemas/doctor.schema';
import {
  RethusVerification,
  RethusVerificationDocument,
} from './schemas/rethus-verification.schema';

@Injectable()
export class DoctorsService {
  constructor(
    @InjectModel(Doctor.name)
    private readonly doctorModel: Model<DoctorDocument>,
    @InjectModel(RethusVerification.name)
    private readonly rethusVerificationModel: Model<RethusVerificationDocument>,
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
        'status programType titleObtainingOrigin professionOccupation startDate rethusState administrativeAct reportingEntity checkedAt checkedBy evidenceUrl notes',
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
}
