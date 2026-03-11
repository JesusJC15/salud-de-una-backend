import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RequestUser } from '../common/interfaces/request-user.interface';
import { UpdatePatientProfileDto } from './dto/update-patient-profile.dto';
import { Patient, PatientDocument } from './schemas/patient.schema';

@Injectable()
export class PatientsService {
  constructor(
    @InjectModel(Patient.name)
    private readonly patientModel: Model<PatientDocument>,
  ) {}

  async getMe(user: RequestUser) {
    const patient = await this.patientModel
      .findById(user.userId)
      .select(
        'firstName lastName email role birthDate gender createdAt updatedAt',
      )
      .lean()
      .exec();

    if (!patient) {
      throw new NotFoundException('Paciente no encontrado');
    }

    return {
      id: patient._id.toString(),
      firstName: patient.firstName,
      lastName: patient.lastName,
      email: patient.email,
      role: patient.role,
      birthDate: patient.birthDate,
      gender: patient.gender,
      createdAt: patient.createdAt,
      updatedAt: patient.updatedAt,
    };
  }

  async updateMe(user: RequestUser, dto: UpdatePatientProfileDto) {
    const updatedPatient = await this.patientModel
      .findByIdAndUpdate(
        user.userId,
        {
          ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
          ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
          ...(dto.birthDate !== undefined
            ? { birthDate: new Date(dto.birthDate) }
            : {}),
          ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
        },
        { returnDocument: 'after', runValidators: true },
      )
      .select(
        'firstName lastName email role birthDate gender createdAt updatedAt',
      )
      .lean()
      .exec();

    if (!updatedPatient) {
      throw new NotFoundException('Paciente no encontrado');
    }

    return {
      id: updatedPatient._id.toString(),
      firstName: updatedPatient.firstName,
      lastName: updatedPatient.lastName,
      email: updatedPatient.email,
      role: updatedPatient.role,
      birthDate: updatedPatient.birthDate,
      gender: updatedPatient.gender,
      createdAt: updatedPatient.createdAt,
      updatedAt: updatedPatient.updatedAt,
    };
  }
}
