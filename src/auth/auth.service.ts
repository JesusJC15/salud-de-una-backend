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
import { ClientSession, Model } from 'mongoose';
import { Admin, AdminDocument } from '../admins/schemas/admin.schema';
import { UserRole } from '../common/enums/user-role.enum';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { RequestUser } from '../common/interfaces/request-user.interface';
import { Doctor, DoctorDocument } from '../doctors/schemas/doctor.schema';
import { ProvisionDoctorDto } from './dto/provision-doctor.dto';
import { ProvisionPatientDto } from './dto/provision-patient.dto';
import { RegisterDoctorDto } from './dto/register-doctor.dto';
import { RegisterPatientDto } from './dto/register-patient.dto';
import { Patient, PatientDocument } from '../patients/schemas/patient.schema';
import {
  RefreshSession,
  RefreshSessionDocument,
} from './schemas/refresh-session.schema';
import { ProvisioningService } from './provisioning.service';

type JoseModule = typeof import('jose');
type JoseJWTPayload = import('jose').JWTPayload;

type AuthUser = {
  id: string;
  email: string;
  role: UserRole;
  passwordHash: string;
  isActive: boolean;
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

type Auth0Identity = {
  subject: string;
  email: string;
  role: UserRole | null;
  dbId: string | null;
};

@Injectable()
export class AuthService {
  private static readonly AUTH0_CLAIMS_NAMESPACE = 'https://salud-de-una.com/';
  private auth0Jwks: ReturnType<JoseModule['createRemoteJWKSet']> | null = null;
  private auth0JwksUri = '';

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
    private readonly provisioningService: ProvisioningService,
  ) {}

  async registerPatient(dto: RegisterPatientDto) {
    await this.ensureEmailIsAvailable(dto.email);

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const patient = await this.patientModel.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      passwordHash,
      birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
      gender: dto.gender,
    });

    // Best-effort: mirror the patient in Auth0 so they can log in via
    // Auth0 immediately after manual registration. Never blocks the response.
    await this.provisioningService.createAuth0UserFromManualRegistration(
      patient.email,
      dto.password,
      patient.id,
    );

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
    await this.ensureEmailIsAvailable(dto.email);

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

  async ensureEmailIsAvailable(email: string): Promise<void> {
    await this.assertEmailDoesNotExist(email);
  }

  async revokeAllRefreshSessionsForUser(
    userId: string,
    role: UserRole,
    reason: string,
    session?: ClientSession,
  ): Promise<void> {
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
            revokedReason: reason,
          },
        },
        session ? { session } : undefined,
      )
      .exec();
  }

  async authenticateAccessToken(token: string): Promise<RequestUser> {
    const localIdentity = await this.tryAuthenticateLocalAccessToken(token);
    if (localIdentity) {
      return localIdentity;
    }

    const auth0Identity = await this.verifyAuth0AccessToken(token);
    const requestUser = await this.resolveAuth0RequestUser(auth0Identity);
    if (!requestUser) {
      throw new UnauthorizedException('Token invalido o usuario inactivo');
    }

    return requestUser;
  }

  async provisionPatientWithAuth0(
    dto: ProvisionPatientDto,
    authorizationHeader?: string,
  ) {
    const identity =
      await this.verifyAuth0FromAuthorizationHeader(authorizationHeader);
    const linkedUser = await this.findRequestUserByAuth0Subject(
      identity.subject,
    );

    if (linkedUser) {
      if (linkedUser.role !== UserRole.PATIENT) {
        throw new ConflictException(
          'La cuenta de Auth0 ya esta vinculada con otro rol',
        );
      }

      const patient = await this.patientModel
        .findById(linkedUser.userId)
        .exec();
      if (!patient) {
        throw new UnauthorizedException('Token invalido o usuario inactivo');
      }

      return {
        id: patient.id,
        firstName: patient.firstName,
        lastName: patient.lastName,
        email: patient.email,
        role: patient.role,
        createdAt: patient.createdAt ?? new Date(),
      };
    }

    await this.ensureEmailIsAvailable(identity.email);

    const passwordHash = await this.buildExternalPasswordHash();
    const patient = await this.patientModel.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: identity.email,
      auth0Subject: identity.subject,
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

  async provisionDoctorWithAuth0(
    dto: ProvisionDoctorDto,
    authorizationHeader?: string,
  ) {
    const identity =
      await this.verifyAuth0FromAuthorizationHeader(authorizationHeader);
    const linkedUser = await this.findRequestUserByAuth0Subject(
      identity.subject,
    );

    if (linkedUser) {
      if (linkedUser.role !== UserRole.DOCTOR) {
        throw new ConflictException(
          'La cuenta de Auth0 ya esta vinculada con otro rol',
        );
      }

      const doctor = await this.doctorModel.findById(linkedUser.userId).exec();
      if (!doctor) {
        throw new UnauthorizedException('Token invalido o usuario inactivo');
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

    await this.ensureEmailIsAvailable(identity.email);
    if (!dto.personalId) {
      throw new BadRequestException('personalId es obligatorio');
    }
    await this.assertPersonalIdDoesNotExist(dto.personalId);

    const passwordHash = await this.buildExternalPasswordHash();
    const doctor = await this.doctorModel.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: identity.email,
      auth0Subject: identity.subject,
      passwordHash,
      specialty: dto.specialty,
      personalId: dto.personalId,
      phoneNumber: dto.phoneNumber,
      professionalLicense: dto.professionalLicense,
    });

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
    if (!authUser?.isActive) {
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
        isActive: patient.isActive,
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
        isActive: doctor.isActive,
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
        isActive: admin.isActive,
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

  private async tryAuthenticateLocalAccessToken(
    token: string,
  ): Promise<RequestUser | null> {
    const jwtSecret = this.configService.getOrThrow<string>('auth.jwtSecret');
    let payload: JwtPayload;

    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: jwtSecret,
      });
    } catch {
      return null;
    }

    if (payload.tokenType !== 'access') {
      throw new UnauthorizedException(
        'Token invalido o tipo de token no permitido',
      );
    }

    const authUser = await this.findAuthUserById(payload.sub, payload.role);
    if (!authUser) {
      throw new UnauthorizedException('Token invalido o usuario inactivo');
    }

    return {
      userId: authUser.id,
      email: authUser.email,
      role: authUser.role,
      isActive: true,
    };
  }

  private async verifyAuth0FromAuthorizationHeader(
    authorizationHeader?: string,
  ): Promise<Auth0Identity> {
    const token = this.extractBearerToken(authorizationHeader);
    return this.verifyAuth0AccessToken(token);
  }

  private extractBearerToken(authorizationHeader?: string): string {
    const trimmedHeader = authorizationHeader?.trim();
    if (!trimmedHeader?.toLowerCase().startsWith('bearer ')) {
      throw new UnauthorizedException('Bearer token ausente');
    }

    const token = trimmedHeader.slice(7).trim();
    if (!token) {
      throw new UnauthorizedException('Bearer token ausente');
    }

    return token;
  }

  private async verifyAuth0AccessToken(token: string): Promise<Auth0Identity> {
    const { jwtVerify } = await this.getJoseModule();
    const auth0Audience = this.configService.get<string>('auth.auth0Audience');
    const auth0Issuer = this.resolveAuth0Issuer();

    if (!auth0Audience || !auth0Issuer) {
      throw new UnauthorizedException('Auth0 no esta configurado');
    }

    const { payload } = await jwtVerify(
      token,
      await this.getAuth0Jwks(auth0Issuer),
      {
        issuer: auth0Issuer,
        audience: auth0Audience,
      },
    );

    if (typeof payload.sub !== 'string' || payload.sub.trim().length === 0) {
      throw new UnauthorizedException('Token de Auth0 sin subject valido');
    }

    if (payload.email_verified === false) {
      throw new UnauthorizedException('El correo de Auth0 no esta verificado');
    }

    const emailValue =
      payload[`${AuthService.AUTH0_CLAIMS_NAMESPACE}email`] ?? payload.email;
    if (typeof emailValue !== 'string' || emailValue.trim().length === 0) {
      throw new UnauthorizedException('Token de Auth0 sin correo valido');
    }

    const roleValue =
      payload[`${AuthService.AUTH0_CLAIMS_NAMESPACE}role`] ?? payload.role;
    const dbIdValue =
      payload[`${AuthService.AUTH0_CLAIMS_NAMESPACE}db_id`] ?? payload.db_id;

    return {
      subject: payload.sub.trim(),
      email: emailValue.trim().toLowerCase(),
      role: this.parseUserRole(roleValue),
      dbId:
        typeof dbIdValue === 'string' && dbIdValue.trim().length > 0
          ? dbIdValue.trim()
          : null,
    };
  }

  private async resolveAuth0RequestUser(
    identity: Auth0Identity,
  ): Promise<RequestUser | null> {
    if (identity.dbId && identity.role) {
      const user = await this.findAuthUserById(identity.dbId, identity.role);
      if (user) {
        await this.syncAuth0Subject(user.role, user.id, identity.subject);
        return {
          userId: user.id,
          email: user.email,
          role: user.role,
          isActive: true,
        };
      }
    }

    const linkedUser = await this.findRequestUserByAuth0Subject(
      identity.subject,
    );
    if (linkedUser) {
      return linkedUser;
    }

    return this.findOrLinkRequestUserByEmail(identity.email, identity.subject);
  }

  private async findRequestUserByAuth0Subject(
    subject: string,
  ): Promise<RequestUser | null> {
    const [patient, doctor, admin] = await Promise.all([
      this.patientModel
        .findOne({ auth0Subject: subject })
        .select('email role isActive')
        .lean()
        .exec(),
      this.doctorModel
        .findOne({ auth0Subject: subject })
        .select('email role isActive')
        .lean()
        .exec(),
      this.adminModel
        .findOne({ auth0Subject: subject })
        .select('email role isActive')
        .lean()
        .exec(),
    ]);

    if (patient?.isActive) {
      return {
        userId: patient._id.toString(),
        email: patient.email,
        role: patient.role,
        isActive: true,
      };
    }

    if (doctor?.isActive) {
      return {
        userId: doctor._id.toString(),
        email: doctor.email,
        role: doctor.role,
        isActive: true,
      };
    }

    if (admin?.isActive) {
      return {
        userId: admin._id.toString(),
        email: admin.email,
        role: admin.role,
        isActive: true,
      };
    }

    return null;
  }

  private async findOrLinkRequestUserByEmail(
    email: string,
    subject: string,
  ): Promise<RequestUser | null> {
    const [patient, doctor, admin] = await Promise.all([
      this.patientModel
        .findOne({ email })
        .select('email role isActive auth0Subject')
        .lean()
        .exec(),
      this.doctorModel
        .findOne({ email })
        .select('email role isActive auth0Subject')
        .lean()
        .exec(),
      this.adminModel
        .findOne({ email })
        .select('email role isActive auth0Subject')
        .lean()
        .exec(),
    ]);

    if (patient) {
      return this.linkAuth0SubjectForResolvedUser(
        {
          userId: patient._id.toString(),
          email: patient.email,
          role: patient.role,
          isActive: patient.isActive,
        },
        patient.auth0Subject,
        subject,
      );
    }

    if (doctor) {
      return this.linkAuth0SubjectForResolvedUser(
        {
          userId: doctor._id.toString(),
          email: doctor.email,
          role: doctor.role,
          isActive: doctor.isActive,
        },
        doctor.auth0Subject,
        subject,
      );
    }

    if (admin) {
      return this.linkAuth0SubjectForResolvedUser(
        {
          userId: admin._id.toString(),
          email: admin.email,
          role: admin.role,
          isActive: admin.isActive,
        },
        admin.auth0Subject,
        subject,
      );
    }

    return null;
  }

  private async linkAuth0SubjectForResolvedUser(
    user: RequestUser,
    currentAuth0Subject: string | null | undefined,
    nextAuth0Subject: string,
  ): Promise<RequestUser | null> {
    if (!user.isActive) {
      return null;
    }

    if (currentAuth0Subject && currentAuth0Subject !== nextAuth0Subject) {
      throw new UnauthorizedException('Cuenta Auth0 no autorizada');
    }

    if (!currentAuth0Subject) {
      await this.syncAuth0Subject(user.role, user.userId, nextAuth0Subject);
    }

    return user;
  }

  private async syncAuth0Subject(
    role: UserRole,
    userId: string,
    auth0Subject: string,
  ): Promise<void> {
    const update = { $set: { auth0Subject } };

    if (role === UserRole.PATIENT) {
      await this.patientModel.updateOne({ _id: userId }, update).exec();
      return;
    }

    if (role === UserRole.DOCTOR) {
      await this.doctorModel.updateOne({ _id: userId }, update).exec();
      return;
    }

    await this.adminModel.updateOne({ _id: userId }, update).exec();
  }

  private parseUserRole(value: JoseJWTPayload[string]): UserRole | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim().toUpperCase();
    switch (normalized) {
      case 'PATIENT':
        return UserRole.PATIENT;
      case 'DOCTOR':
        return UserRole.DOCTOR;
      case 'ADMIN':
        return UserRole.ADMIN;
      default:
        return null;
    }
  }

  private resolveAuth0Issuer(): string | null {
    const configuredIssuer =
      this.configService.get<string>('auth.auth0Issuer')?.trim() ?? '';
    if (configuredIssuer) {
      return configuredIssuer.endsWith('/')
        ? configuredIssuer
        : `${configuredIssuer}/`;
    }

    const configuredDomain =
      this.configService.get<string>('auth.auth0Domain')?.trim() ?? '';
    if (!configuredDomain) {
      return null;
    }

    const origin = configuredDomain.startsWith('http')
      ? configuredDomain
      : `https://${configuredDomain}`;

    return origin.endsWith('/') ? origin : `${origin}/`;
  }

  private async getAuth0Jwks(auth0Issuer: string) {
    const { createRemoteJWKSet } = await this.getJoseModule();
    const jwksUri = new URL('.well-known/jwks.json', auth0Issuer).toString();
    if (!this.auth0Jwks || this.auth0JwksUri !== jwksUri) {
      this.auth0JwksUri = jwksUri;
      this.auth0Jwks = createRemoteJWKSet(new URL(jwksUri));
    }

    return this.auth0Jwks;
  }

  private async getJoseModule(): Promise<JoseModule> {
    return import('jose');
  }

  private async buildExternalPasswordHash(): Promise<string> {
    return bcrypt.hash(randomBytes(32).toString('hex'), 12);
  }
}
