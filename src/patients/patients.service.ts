import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Connection, Model } from 'mongoose';
import { AuthService } from '../auth/auth.service';
import { UserRole } from '../common/enums/user-role.enum';
import { RequestUser } from '../common/interfaces/request-user.interface';
import { UpdatePatientProfileDto } from './dto/update-patient-profile.dto';
import { Patient, PatientDocument } from './schemas/patient.schema';

@Injectable()
export class PatientsService {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,
    @InjectModel(Patient.name)
    private readonly patientModel: Model<PatientDocument>,
    private readonly authService: AuthService,
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

    return this.toProfileResponse(patient);
  }

  async updateMe(user: RequestUser, dto: UpdatePatientProfileDto) {
    try {
      const session = await this.connection.startSession();
      try {
        let response:
          | ReturnType<PatientsService['toProfileResponse']>
          | undefined;

        await session.withTransaction(async () => {
          const patient = await this.patientModel
            .findById(user.userId)
            .session(session)
            .exec();

          if (!patient) {
            throw new NotFoundException('Paciente no encontrado');
          }

          const normalizedEmail =
            dto.email !== undefined
              ? this.normalizeEmail(dto.email)
              : undefined;
          const wantsEmailChange =
            normalizedEmail !== undefined && normalizedEmail !== patient.email;
          const wantsPasswordChange = dto.newPassword !== undefined;
          const hasSensitiveChange = wantsEmailChange || wantsPasswordChange;

          if (wantsPasswordChange && !dto.currentPassword) {
            throw new BadRequestException(
              'Debes enviar la contraseña actual para cambiar la contraseña',
            );
          }

          if (wantsEmailChange && !dto.currentPassword) {
            throw new BadRequestException(
              'Debes enviar la contraseña actual para cambiar el correo',
            );
          }

          if (dto.currentPassword && !hasSensitiveChange) {
            throw new BadRequestException(
              'La contraseña actual solo se permite cuando cambias correo o contraseña',
            );
          }

          if (hasSensitiveChange) {
            const patientWithPassword = await this.patientModel
              .findById(user.userId)
              .select('+passwordHash')
              .session(session)
              .exec();

            if (!patientWithPassword) {
              throw new NotFoundException('Paciente no encontrado');
            }

            const currentPasswordMatches = await bcrypt.compare(
              dto.currentPassword!,
              patientWithPassword.passwordHash,
            );

            if (!currentPasswordMatches) {
              throw new BadRequestException(
                'La contraseña actual es incorrecta',
              );
            }

            if (wantsPasswordChange) {
              if (dto.newPassword === dto.currentPassword) {
                throw new BadRequestException(
                  'La nueva contraseña debe ser diferente a la actual',
                );
              }
            }
          }

          if (wantsEmailChange) {
            const emailToUpdate = normalizedEmail;
            await this.authService.ensureEmailIsAvailable(emailToUpdate);
            patient.email = emailToUpdate;
          }

          if (dto.firstName !== undefined) {
            patient.firstName = dto.firstName;
          }

          if (dto.lastName !== undefined) {
            patient.lastName = dto.lastName;
          }

          if (dto.birthDate !== undefined) {
            patient.birthDate = new Date(dto.birthDate);
          }

          if (dto.gender !== undefined) {
            patient.gender = dto.gender;
          }

          if (wantsPasswordChange) {
            patient.passwordHash = await bcrypt.hash(dto.newPassword!, 12);
          }

          await patient.save({ session });

          if (wantsPasswordChange) {
            await this.authService.revokeAllRefreshSessionsForUser(
              patient.id,
              UserRole.PATIENT,
              'password_changed',
              session,
            );
          }

          response = this.toProfileResponse(patient);
        });

        return response!;
      } finally {
        await session.endSession();
      }
    } catch (error: unknown) {
      if (this.isDuplicateKeyError(error, 'email')) {
        throw new ConflictException('El correo ya está registrado');
      }

      throw error;
    }
  }

  private toProfileResponse(patient: {
    _id?: { toString(): string };
    id?: string;
    firstName: string;
    lastName: string;
    email: string;
    role: UserRole;
    birthDate?: Date | null;
    gender?: string;
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    const patientId = patient.id ?? patient._id?.toString();

    if (!patientId) {
      throw new InternalServerErrorException(
        'No fue posible construir el perfil del paciente',
      );
    }

    return {
      id: patientId,
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

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private isDuplicateKeyError(error: unknown, field: string): boolean {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as Record<string, unknown>).code === 11000
    ) {
      const keyPattern = (error as Record<string, unknown>).keyPattern;
      return (
        typeof keyPattern === 'object' &&
        keyPattern !== null &&
        field in (keyPattern as Record<string, unknown>)
      );
    }

    return false;
  }
}
