import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { AuthService } from '../auth/auth.service';
import {
  Consultation,
  ConsultationDocument,
} from '../consultations/schemas/consultation.schema';
import {
  Followup,
  FollowupDocument,
} from '../followups/schemas/followup.schema';
import {
  TriageSession,
  TriageSessionDocument,
} from '../triage/schemas/triage-session.schema';
import {
  Transaction,
  TransactionDocument,
} from '../billing/schemas/transaction.schema';
import { UserRole } from '../common/enums/user-role.enum';
import { RequestUser } from '../common/interfaces/request-user.interface';
import { PatientTimelineService } from './patient-timeline.service';
import { TimelineQueryDto } from './dto/timeline-query.dto';
import { UpdatePatientProfileDto } from './dto/update-patient-profile.dto';
import { UpdatePushTokenDto } from './dto/update-push-token.dto';
import { Patient, PatientDocument } from './schemas/patient.schema';

@Injectable()
export class PatientsService {
  constructor(
    @Optional()
    @InjectConnection()
    private readonly connection: Connection | null,
    @InjectModel(Patient.name)
    private readonly patientModel: Model<PatientDocument>,
    @InjectModel(Consultation.name)
    private readonly consultationModel: Model<ConsultationDocument>,
    @InjectModel(TriageSession.name)
    private readonly triageSessionModel: Model<TriageSessionDocument>,
    @InjectModel(Followup.name)
    private readonly followupModel: Model<FollowupDocument>,
    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,
    private readonly authService: AuthService,
    private readonly patientTimelineService: PatientTimelineService,
  ) {}

  async getMe(user: RequestUser) {
    const patient = await this.patientModel
      .findById(user.userId)
      .select(
        'firstName lastName email role birthDate gender heightCm weightKg createdAt updatedAt',
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
      const session = await this.connection!.startSession();
      try {
        let response:
          | ReturnType<PatientsService['toProfileResponse']>
          | undefined;

        await session.withTransaction(async () => {
          const patient = await this.patientModel
            .findById(user.userId)
            .select('+passwordHash')
            .session(session)
            .exec();

          if (!patient) {
            throw new NotFoundException('Paciente no encontrado');
          }

          const normalizedEmail =
            dto.email != null ? this.normalizeEmail(dto.email) : undefined;
          const wantsEmailChange =
            normalizedEmail !== undefined && normalizedEmail !== patient.email;
          const wantsPasswordChange = dto.newPassword !== undefined;
          const requiresCurrentPassword =
            wantsEmailChange || wantsPasswordChange;

          if (
            !requiresCurrentPassword &&
            (dto.currentPassword !== undefined || dto.newPassword !== undefined)
          ) {
            throw new BadRequestException(
              'Payload de credenciales incoherente',
            );
          }

          if (requiresCurrentPassword && !dto.currentPassword) {
            throw new BadRequestException(
              'currentPassword es obligatorio para cambios sensibles',
            );
          }

          if (requiresCurrentPassword) {
            const matches = await bcrypt.compare(
              dto.currentPassword!,
              patient.passwordHash,
            );

            if (!matches) {
              throw new BadRequestException(
                'La contraseña actual es incorrecta',
              );
            }
          }

          if (wantsEmailChange && normalizedEmail) {
            await this.authService.ensureEmailIsAvailable(normalizedEmail);
            patient.email = normalizedEmail;
          }

          if (wantsPasswordChange) {
            const isSamePassword = await bcrypt.compare(
              dto.newPassword!,
              patient.passwordHash,
            );
            if (isSamePassword) {
              throw new BadRequestException(
                'La nueva contraseña debe ser diferente a la actual',
              );
            }

            patient.passwordHash = await bcrypt.hash(dto.newPassword!, 12);
            await this.authService.revokeAllRefreshSessionsForUser(
              patient.id,
              patient.role,
              'password_changed',
              session,
            );
          }

          if (dto.firstName !== undefined) patient.firstName = dto.firstName;
          if (dto.lastName !== undefined) patient.lastName = dto.lastName;
          if (dto.birthDate !== undefined) {
            patient.birthDate = new Date(dto.birthDate);
          }
          if (dto.gender !== undefined) patient.gender = dto.gender;
          if (dto.heightCm !== undefined) patient.heightCm = dto.heightCm;
          if (dto.weightKg !== undefined) patient.weightKg = dto.weightKg;

          await patient.save({ session });
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

  async updatePushToken(user: RequestUser, dto: UpdatePushTokenDto) {
    const patient = await this.patientModel.findById(user.userId).exec();
    if (!patient) {
      throw new NotFoundException('Paciente no encontrado');
    }

    patient.pushTokens = Array.from(
      new Set([...(patient.pushTokens ?? []), dto.token]),
    );
    patient.expoPushToken = dto.token;
    await patient.save();

    return {
      updated: true,
      tokensCount: patient.pushTokens.length,
    };
  }

  async getTimeline(
    user: RequestUser,
    patientId: string,
    query: TimelineQueryDto,
  ) {
    return this.patientTimelineService.getTimeline(user, patientId, query);
  }

  async exportPatientData(user: RequestUser) {
    const patientObjectId = new Types.ObjectId(user.userId);
    const [patient, consultations, triageSessions, followups, transactions] =
      await Promise.all([
        this.patientModel
          .findById(patientObjectId)
          .select('-passwordHash')
          .lean()
          .exec(),
        this.consultationModel
          .find({ patientId: patientObjectId })
          .lean()
          .exec(),
        this.triageSessionModel
          .find({ patientId: patientObjectId })
          .lean()
          .exec(),
        this.followupModel.find({ patientId: patientObjectId }).lean().exec(),
        this.transactionModel
          .find({ patientId: patientObjectId })
          .lean()
          .exec(),
      ]);

    if (!patient) {
      throw new NotFoundException('Paciente no encontrado');
    }

    return {
      exportedAt: new Date(),
      patient,
      consultations,
      triageSessions,
      followups,
      transactions,
    };
  }

  async anonymizeAccount(user: RequestUser) {
    if (!this.connection?.startSession) {
      const patient = await this.patientModel.findById(user.userId).exec();
      if (!patient) {
        throw new NotFoundException('Paciente no encontrado');
      }

      const hash = crypto
        .createHash('sha256')
        .update(user.userId)
        .digest('hex')
        .slice(0, 16);

      patient.firstName = 'Cuenta';
      patient.lastName = 'Eliminada';
      patient.email = `deleted-${hash}@deleted.local`;
      patient.passwordHash = await bcrypt.hash(hash, 10);
      patient.pushTokens = [];
      patient.expoPushToken = undefined;
      patient.auth0Subject = undefined;
      patient.birthDate = null;
      patient.gender = undefined;
      patient.heightCm = undefined;
      patient.weightKg = undefined;
      patient.termsAcceptedAt = null;
      patient.isActive = false;
      patient.isAnonymized = true;

      await this.authService.revokeAllRefreshSessionsForUser(
        user.userId,
        UserRole.PATIENT,
        'account_deleted',
      );
      await patient.save();

      return {
        anonymized: true,
        accountState: 'ANONYMIZED',
      };
    }

    const session = await this.connection.startSession();
    if (!session?.withTransaction || !session.endSession) {
      const patient = await this.patientModel.findById(user.userId).exec();
      if (!patient) {
        throw new NotFoundException('Paciente no encontrado');
      }

      const hash = crypto
        .createHash('sha256')
        .update(user.userId)
        .digest('hex')
        .slice(0, 16);

      patient.firstName = 'Cuenta';
      patient.lastName = 'Eliminada';
      patient.email = `deleted-${hash}@deleted.local`;
      patient.passwordHash = await bcrypt.hash(hash, 10);
      patient.pushTokens = [];
      patient.expoPushToken = undefined;
      patient.auth0Subject = undefined;
      patient.birthDate = null;
      patient.gender = undefined;
      patient.heightCm = undefined;
      patient.weightKg = undefined;
      patient.termsAcceptedAt = null;
      patient.isActive = false;
      patient.isAnonymized = true;

      await this.authService.revokeAllRefreshSessionsForUser(
        user.userId,
        UserRole.PATIENT,
        'account_deleted',
      );
      await patient.save();

      return {
        anonymized: true,
        accountState: 'ANONYMIZED',
      };
    }
    try {
      await session.withTransaction(async () => {
        const patient = await this.patientModel
          .findById(user.userId)
          .session(session)
          .exec();
        if (!patient) {
          throw new NotFoundException('Paciente no encontrado');
        }

        const hash = crypto
          .createHash('sha256')
          .update(user.userId)
          .digest('hex')
          .slice(0, 16);

        patient.firstName = 'Cuenta';
        patient.lastName = 'Eliminada';
        patient.email = `deleted-${hash}@deleted.local`;
        patient.passwordHash = await bcrypt.hash(hash, 10);
        patient.pushTokens = [];
        patient.expoPushToken = undefined;
        patient.auth0Subject = undefined;
        patient.birthDate = null;
        patient.gender = undefined;
        patient.heightCm = undefined;
        patient.weightKg = undefined;
        patient.termsAcceptedAt = null;
        patient.isActive = false;
        patient.isAnonymized = true;

        await this.authService.revokeAllRefreshSessionsForUser(
          user.userId,
          UserRole.PATIENT,
          'account_deleted',
          session,
        );
        await patient.save({ session });
      });
    } finally {
      await session.endSession();
    }

    return {
      anonymized: true,
      accountState: 'ANONYMIZED',
    };
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
    heightCm?: number;
    weightKg?: number;
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
      heightCm: patient.heightCm,
      weightKg: patient.weightKg,
      bmi: this.calculateBmi(patient.heightCm, patient.weightKg),
      createdAt: patient.createdAt,
      updatedAt: patient.updatedAt,
    };
  }

  private calculateBmi(heightCm?: number, weightKg?: number): number | null {
    if (
      typeof heightCm !== 'number' ||
      typeof weightKg !== 'number' ||
      heightCm <= 0 ||
      weightKg <= 0
    ) {
      return null;
    }

    const heightMeters = heightCm / 100;
    return Math.round((weightKg / (heightMeters * heightMeters)) * 10) / 10;
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
