import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import type { StringValue } from 'ms';
import { Model } from 'mongoose';
import { Admin, AdminDocument } from '../admins/schemas/admin.schema';
import { UserRole } from '../common/enums/user-role.enum';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { RequestUser } from '../common/interfaces/request-user.interface';
import { Doctor, DoctorDocument } from '../doctors/schemas/doctor.schema';
import { RegisterDoctorDto } from './dto/register-doctor.dto';
import { RegisterPatientDto } from './dto/register-patient.dto';
import { Patient, PatientDocument } from '../patients/schemas/patient.schema';
import {
  RefreshSession,
  RefreshSessionDocument,
} from './schemas/refresh-session.schema';

type AuthUser = {
  id: string;
  email: string;
  role: UserRole;
  passwordHash: string;
};

type AuthSession = {
  accessToken: string;
  refreshToken: string;
  refreshSessionId: string;
  user: {
    id: string;
    email: string;
    role: UserRole;
  };
};

type TokenUser = {
  id: string;
  email: string;
  role: UserRole;
};

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(Patient.name)
    private readonly patientModel: Model<PatientDocument>,
    @InjectModel(Doctor.name)
    private readonly doctorModel: Model<DoctorDocument>,
    @InjectModel(Admin.name)
    private readonly adminModel: Model<AdminDocument>,
    @InjectModel(RefreshSession.name)
    private readonly refreshSessionModel: Model<RefreshSessionDocument>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async registerPatient(dto: RegisterPatientDto) {
    await this.assertEmailDoesNotExist(dto.email);

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const patient = await this.patientModel.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      passwordHash,
      birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
      gender: dto.gender,
    });

    return {
      id: patient.id,
      firstName: patient.firstName,
      lastName: patient.lastName,
      email: patient.email,
      role: patient.role,
      createdAt: patient.createdAt ?? new Date(),
    };
  }

  async registerDoctor(dto: RegisterDoctorDto) {
    await this.assertEmailDoesNotExist(dto.email);

    if (!dto.personalId || !dto.personalId.trim()) {
      throw new BadRequestException('personalId must not be empty');
    }

    await this.assertPersonalIdDoesNotExist(dto.personalId);

    const passwordHash = await bcrypt.hash(dto.password, 12);
    let doctor: DoctorDocument;
    try {
      doctor = await this.doctorModel.create({
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        passwordHash,
        specialty: dto.specialty,
        personalId: dto.personalId,
        phoneNumber: dto.phoneNumber,
        professionalLicense: dto.professionalLicense,
      });
    } catch (err: unknown) {
      if (this.isDuplicateKeyError(err, 'personalId')) {
        throw new ConflictException('El ID personal ya esta registrado');
      }
      if (this.isDuplicateKeyError(err, 'email')) {
        throw new ConflictException('El correo ya esta registrado');
      }
      throw err;
    }

    return {
      id: doctor.id,
      firstName: doctor.firstName,
      lastName: doctor.lastName,
      email: doctor.email,
      role: doctor.role,
      specialty: doctor.specialty,
      doctorStatus: doctor.doctorStatus,
      createdAt: doctor.createdAt ?? new Date(),
    };
  }

  async loginPatient(email: string, password: string): Promise<AuthSession> {
    const authUser = await this.findPatientAuthUser(email);
    const validUser = await this.assertValidCredentials(authUser, password);
    return this.buildSession(validUser);
  }

  async loginStaff(email: string, password: string): Promise<AuthSession> {
    const authUser = await this.findStaffAuthUser(email);
    const validUser = await this.assertValidCredentials(authUser, password);
    return this.buildSession(validUser);
  }

  async refreshTokens(refreshToken?: string): Promise<AuthSession> {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token ausente');
    }

    const jwtRefreshSecret = this.configService.getOrThrow<string>(
      'auth.jwtRefreshSecret',
    );

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: jwtRefreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Refresh token invalido o expirado');
    }

    if (payload.tokenType !== 'refresh') {
      throw new UnauthorizedException('Tipo de token invalido');
    }

    if (!payload.jti) {
      throw new UnauthorizedException('Sesion de refresh invalida');
    }

    await this.validateRefreshSession(payload, refreshToken);

    const authUser = await this.findAuthUserById(payload.sub, payload.role);
    if (!authUser) {
      throw new UnauthorizedException('Usuario no autorizado');
    }

    return this.buildSession(authUser);
  }

  async revokeRefreshSession(refreshToken?: string): Promise<void> {
    if (!refreshToken) {
      return;
    }

    const jwtRefreshSecret = this.configService.getOrThrow<string>(
      'auth.jwtRefreshSecret',
    );

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(
        refreshToken,
        {
          secret: jwtRefreshSecret,
        },
      );

      if (!payload.jti) {
        return;
      }

      await this.revokeSessionById(payload.jti, 'logout');
    } catch {
      // Token invalido o expirado: no se propaga para mantener logout idempotente.
    }
  }

  me(user: RequestUser) {
    return {
      user: {
        id: user.userId,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
      },
    };
  }

  private async buildSession(
    authUser: TokenUser,
    previousSessionId?: string,
  ): Promise<AuthSession> {
    const jwtSecret = this.configService.getOrThrow<string>('auth.jwtSecret');
    const jwtRefreshSecret = this.configService.getOrThrow<string>(
      'auth.jwtRefreshSecret',
    );
    const accessTokenExpiresIn = this.configService.getOrThrow<StringValue>(
      'auth.accessTokenExpiresIn',
    );
    const refreshTokenExpiresIn = this.configService.getOrThrow<StringValue>(
      'auth.refreshTokenExpiresIn',
    );

    const refreshSessionId = randomBytes(24).toString('hex');

    const payload: JwtPayload = {
      sub: authUser.id,
      role: authUser.role,
      email: authUser.email,
      tokenType: 'access',
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: jwtSecret,
      expiresIn: accessTokenExpiresIn,
    });
    const refreshToken = await this.jwtService.signAsync(
      {
        sub: authUser.id,
        role: authUser.role,
        email: authUser.email,
        tokenType: 'refresh',
        jti: refreshSessionId,
      },
      {
        secret: jwtRefreshSecret,
        expiresIn: refreshTokenExpiresIn,
      },
    );

    await this.persistRefreshSession(authUser, refreshSessionId, refreshToken);

    if (previousSessionId) {
      await this.revokeSessionById(previousSessionId, 'rotated');
    }

    return {
      accessToken,
      refreshToken,
      refreshSessionId,
      user: {
        id: authUser.id,
        email: authUser.email,
        role: authUser.role,
      },
    };
  }

  private async assertValidCredentials(
    authUser: AuthUser | null,
    password: string,
  ): Promise<AuthUser> {
    if (!authUser) {
      throw new UnauthorizedException('Credenciales invalidas');
    }

    const matches = await bcrypt.compare(password, authUser.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Credenciales invalidas');
    }

    return authUser;
  }

  private async persistRefreshSession(
    authUser: TokenUser,
    sessionId: string,
    refreshToken: string,
  ): Promise<void> {
    const tokenHash = await bcrypt.hash(refreshToken, 10);
    const decodedPayload: unknown = this.jwtService.decode(refreshToken);
    const expiresAt = this.hasExpTimestamp(decodedPayload)
      ? new Date(decodedPayload.exp * 1000)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.refreshSessionModel.create({
      sessionId,
      userId: authUser.id,
      email: authUser.email,
      role: authUser.role,
      tokenHash,
      expiresAt,
    });

    await this.enforceActiveSessionLimit(authUser.id, authUser.role, sessionId);
  }

  private async validateRefreshSession(
    payload: JwtPayload,
    refreshToken: string,
  ): Promise<void> {
    const refreshSession = await this.refreshSessionModel
      .findOne({
        sessionId: payload.jti,
        userId: payload.sub,
        role: payload.role,
        revokedAt: { $exists: false },
      })
      .lean()
      .exec();

    if (!refreshSession) {
      throw new UnauthorizedException(
        'Sesion de refresh revocada o inexistente',
      );
    }

    if (refreshSession.expiresAt.getTime() < Date.now()) {
      await this.revokeSessionById(refreshSession.sessionId, 'expired');
      throw new UnauthorizedException('Sesion de refresh expirada');
    }

    const tokenMatches = await bcrypt.compare(
      refreshToken,
      refreshSession.tokenHash,
    );
    if (!tokenMatches) {
      throw new UnauthorizedException('Refresh token no valido para la sesion');
    }

    // Atomically consume (revoke) the session to prevent replay attacks from
    // concurrent requests that may have passed the validation checks above.
    const consumed = await this.refreshSessionModel
      .findOneAndUpdate(
        {
          sessionId: payload.jti,
          userId: payload.sub,
          role: payload.role,
          revokedAt: { $exists: false },
        },
        {
          $set: {
            revokedAt: new Date(),
            revokedReason: 'rotated',
          },
        },
      )
      .lean()
      .exec();

    if (!consumed) {
      throw new UnauthorizedException(
        'Sesion de refresh revocada o inexistente',
      );
    }
  }

  private async revokeSessionById(
    sessionId: string,
    reason: string,
  ): Promise<void> {
    await this.refreshSessionModel
      .updateOne(
        { sessionId, revokedAt: { $exists: false } },
        {
          $set: {
            revokedAt: new Date(),
            revokedReason: reason,
          },
        },
      )
      .exec();
  }

  private async enforceActiveSessionLimit(
    userId: string,
    role: UserRole,
    keepSessionId: string,
  ): Promise<void> {
    const maxActiveSessions =
      this.configService.get<number>('web.refreshMaxActiveSessions') ?? 3;

    const activeSessions = await this.refreshSessionModel
      .find({
        userId,
        role,
        revokedAt: { $exists: false },
        expiresAt: { $gt: new Date() },
      })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    if (activeSessions.length <= maxActiveSessions) {
      return;
    }

    const sessionsToRevoke = activeSessions
      .filter((session) => session.sessionId !== keepSessionId)
      .slice(maxActiveSessions - 1)
      .map((session) => session.sessionId);

    if (sessionsToRevoke.length === 0) {
      return;
    }

    await this.refreshSessionModel
      .updateMany(
        {
          sessionId: { $in: sessionsToRevoke },
          revokedAt: { $exists: false },
        },
        {
          $set: {
            revokedAt: new Date(),
            revokedReason: 'session_limit',
          },
        },
      )
      .exec();
  }

  private hasExpTimestamp(payload: unknown): payload is { exp: number } {
    if (!payload || typeof payload !== 'object') {
      return false;
    }

    const candidate = payload as Record<string, unknown>;
    return typeof candidate.exp === 'number';
  }

  private isDuplicateKeyError(err: unknown, field: string): boolean {
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as Record<string, unknown>).code === 11000
    ) {
      const keyPattern = (err as Record<string, unknown>).keyPattern;
      return (
        typeof keyPattern === 'object' &&
        keyPattern !== null &&
        field in (keyPattern as Record<string, unknown>)
      );
    }
    return false;
  }

  private async assertEmailDoesNotExist(email: string): Promise<void> {
    const normalized = email.toLowerCase().trim();
    const [patient, doctor, admin] = await Promise.all([
      this.patientModel.findOne({ email: normalized }).lean().exec(),
      this.doctorModel.findOne({ email: normalized }).lean().exec(),
      this.adminModel.findOne({ email: normalized }).lean().exec(),
    ]);

    if (patient || doctor || admin) {
      throw new ConflictException('El correo ya está registrado');
    }
  }

  private async assertPersonalIdDoesNotExist(
    personalId: string,
  ): Promise<void> {
    const normalized = personalId.trim();

    if (!normalized) {
      throw new BadRequestException('El ID personal no puede estar vacío');
    }

    const existing = await this.doctorModel
      .findOne({ personalId: normalized })
      .lean()
      .exec();

    if (existing) {
      throw new ConflictException('El ID personal ya está registrado');
    }
  }

  private async findPatientAuthUser(email: string): Promise<AuthUser | null> {
    const normalized = email.toLowerCase().trim();

    const patient = await this.patientModel
      .findOne({ email: normalized })
      .select('+passwordHash')
      .exec();

    if (patient) {
      return {
        id: patient.id,
        email: patient.email,
        role: UserRole.PATIENT,
        passwordHash: patient.passwordHash,
      };
    }

    return null;
  }

  private async findStaffAuthUser(email: string): Promise<AuthUser | null> {
    const normalized = email.toLowerCase().trim();

    const doctor = await this.doctorModel
      .findOne({ email: normalized })
      .select('+passwordHash')
      .exec();
    if (doctor) {
      return {
        id: doctor.id,
        email: doctor.email,
        role: UserRole.DOCTOR,
        passwordHash: doctor.passwordHash,
      };
    }

    const admin = await this.adminModel
      .findOne({ email: normalized })
      .select('+passwordHash')
      .exec();
    if (admin) {
      return {
        id: admin.id,
        email: admin.email,
        role: UserRole.ADMIN,
        passwordHash: admin.passwordHash,
      };
    }

    return null;
  }

  private async findAuthUserById(
    userId: string,
    role: UserRole,
  ): Promise<TokenUser | null> {
    if (role === UserRole.PATIENT) {
      const patient = await this.patientModel
        .findById(userId)
        .select('email role isActive')
        .lean()
        .exec();

      if (!patient || !patient.isActive) {
        return null;
      }

      return {
        id: patient._id.toString(),
        email: patient.email,
        role: patient.role,
      };
    }

    if (role === UserRole.DOCTOR) {
      const doctor = await this.doctorModel
        .findById(userId)
        .select('email role isActive')
        .lean()
        .exec();

      if (!doctor || !doctor.isActive) {
        return null;
      }

      return {
        id: doctor._id.toString(),
        email: doctor.email,
        role: doctor.role,
      };
    }

    const admin = await this.adminModel
      .findById(userId)
      .select('email role isActive')
      .lean()
      .exec();

    if (!admin || !admin.isActive) {
      return null;
    }

    return {
      id: admin._id.toString(),
      email: admin.email,
      role: admin.role,
    };
  }
}
