import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { Public } from '../common/decorators/public.decorator';
import type { RequestContext } from '../common/interfaces/request-context.interface';
import { Doctor, DoctorDocument } from '../doctors/schemas/doctor.schema';
import { DoctorStatus } from '../common/enums/doctor-status.enum';
import { Patient, PatientDocument } from '../patients/schemas/patient.schema';
import { UserRole } from '../common/enums/user-role.enum';
import { AuthMeResponseDto } from './dto/auth-me.response.dto';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { ProvisionDoctorDto } from './dto/provision-doctor.dto';
import { ProvisionPatientDto } from './dto/provision-patient.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDoctorDto } from './dto/register-doctor.dto';
import { RegisterPatientDto } from './dto/register-patient.dto';
import { ProvisioningService } from './provisioning.service';
import type { ProvisionUser } from './strategies/jwt-provision.strategy';

interface ProvisionRequestContext extends Omit<RequestContext, 'user'> {
  user: ProvisionUser;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly provisioningService: ProvisioningService,
    @InjectModel(Patient.name)
    private readonly patientModel: Model<PatientDocument>,
    @InjectModel(Doctor.name)
    private readonly doctorModel: Model<DoctorDocument>,
  ) {}

  // ── Provisioning endpoints ─────────────────────────────────────────────────
  // Called by the client after Auth0 signup to create the MongoDB profile.
  // Protected by jwt-provision strategy (validates Auth0 token without db_id).
  // These are @Public() to bypass the global JwtAuthGuard (which requires db_id).

  @Post('provision/patient')
  @Public()
  @UseGuards(AuthGuard('jwt-provision'))
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async provisionPatient(
    @Req() req: ProvisionRequestContext,
    @Body() dto: ProvisionPatientDto,
  ) {
    const { auth0UserId, email } = req.user;

    if (!email) {
      throw new InternalServerErrorException(
        'Token de Auth0 no incluye email. Asegurate de solicitar el scope "email".',
      );
    }

    const existing = await this.patientModel
      .findOne({ email: email.toLowerCase().trim() })
      .select('_id email firstName lastName role')
      .lean()
      .exec();

    if (existing) {
      return this.toPatientProvisionResponse(existing);
    }

    await this.authService.ensureEmailIsAvailable(email);

    const patient = await this.patientModel.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: email.toLowerCase().trim(),
      passwordHash: await bcrypt.hash(auth0UserId, 8),
      birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
      gender: dto.gender,
    });

    await this.provisioningService.setUserDbId(
      auth0UserId,
      patient.id,
      UserRole.PATIENT,
    );

    return this.toPatientProvisionResponse(patient);
  }

  @Post('provision/doctor')
  @Public()
  @UseGuards(AuthGuard('jwt-provision'))
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async provisionDoctor(
    @Req() req: ProvisionRequestContext,
    @Body() dto: ProvisionDoctorDto,
  ) {
    const { auth0UserId, email } = req.user;

    if (!email) {
      throw new InternalServerErrorException(
        'Token de Auth0 no incluye email. Asegurate de solicitar el scope "email".',
      );
    }

    const existing = await this.doctorModel
      .findOne({ email: email.toLowerCase().trim() })
      .select('_id email firstName lastName role specialty doctorStatus')
      .lean()
      .exec();

    if (existing) {
      return this.toDoctorProvisionResponse(existing);
    }

    await this.authService.ensureEmailIsAvailable(email);

    const existingPersonalId = await this.doctorModel
      .findOne({ personalId: dto.personalId.trim() })
      .lean()
      .exec();

    if (existingPersonalId) {
      throw new ConflictException('El ID personal ya está registrado');
    }

    const doctor = await this.doctorModel.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: email.toLowerCase().trim(),
      passwordHash: await bcrypt.hash(auth0UserId, 8),
      specialty: dto.specialty,
      personalId: dto.personalId,
      phoneNumber: dto.phoneNumber,
      professionalLicense: dto.professionalLicense,
      doctorStatus: DoctorStatus.PENDING,
    });

    await this.provisioningService.setUserDbId(
      auth0UserId,
      doctor.id,
      UserRole.DOCTOR,
    );

    return this.toDoctorProvisionResponse(doctor);
  }

  // ── Auth0 migration: password verification endpoint ───────────────────────
  // Used by Auth0 Custom Database Connection to migrate existing users.
  // Protected by a shared secret header — NOT by JWT.

  @Post('migrate-check')
  @Public()
  @HttpCode(HttpStatus.OK)
  async migrateCheck(
    @Req() req: RequestContext,
    @Body() body: { email: string; password: string },
  ) {
    const migrationKey = process.env.AUTH0_MIGRATION_KEY;
    const providedKey = req.headers?.['x-migration-key'] as string | undefined;

    if (!migrationKey || providedKey !== migrationKey) {
      throw new NotFoundException('Not found');
    }

    const patient = await this.patientModel
      .findOne({ email: body.email.toLowerCase().trim() })
      .select('+passwordHash firstName lastName role')
      .lean()
      .exec();

    if (patient) {
      const matches = await bcrypt.compare(body.password, patient.passwordHash);
      if (!matches) throw new NotFoundException('Invalid credentials');
      return {
        user_id: patient._id.toString(),
        email: patient.email,
        role: UserRole.PATIENT,
        firstName: patient.firstName,
        lastName: patient.lastName,
      };
    }

    const doctor = await this.doctorModel
      .findOne({ email: body.email.toLowerCase().trim() })
      .select('+passwordHash firstName lastName role')
      .lean()
      .exec();

    if (doctor) {
      const matches = await bcrypt.compare(body.password, doctor.passwordHash);
      if (!matches) throw new NotFoundException('Invalid credentials');
      return {
        user_id: doctor._id.toString(),
        email: doctor.email,
        role: UserRole.DOCTOR,
        firstName: doctor.firstName,
        lastName: doctor.lastName,
      };
    }

    throw new NotFoundException('User not found');
  }

  // ── Standard endpoint ──────────────────────────────────────────────────────

  @Get('me')
  me(@Req() request: RequestContext): AuthMeResponseDto {
    return this.authService.me(request.user!);
  }

  // ── Legacy endpoints — kept during cutover window ─────────────────────────
  // Remove once all existing mobile/web clients have migrated to Auth0.

  @Post('patient/register')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  registerPatient(@Body() dto: RegisterPatientDto) {
    return this.authService.registerPatient(dto);
  }

  @Post('doctor/register')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  registerDoctor(@Body() dto: RegisterDoctorDto) {
    return this.authService.registerDoctor(dto);
  }

  @Post('patient/login')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async loginPatient(@Body() dto: LoginDto) {
    const session = await this.authService.loginPatient(
      dto.email,
      dto.password,
    );
    return this.buildAuthResponse(session);
  }

  @Post('staff/login')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async loginStaff(@Body() dto: LoginDto) {
    const session = await this.authService.loginStaff(dto.email, dto.password);
    return this.buildAuthResponse(session);
  }

  @Post('refresh')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto) {
    const session = await this.authService.refreshTokens(dto.refreshToken);
    return this.buildAuthResponse(session);
  }

  @Post('logout')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async logout(@Body() dto: LogoutDto) {
    await this.authService.revokeRefreshSession(dto.refreshToken);
    return { message: 'Sesion cerrada' };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private buildAuthResponse(session: {
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string; role: string };
  }) {
    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      user: session.user,
    };
  }

  private toPatientProvisionResponse(patient: {
    _id?: { toString(): string };
    id?: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
  }) {
    return {
      id: patient.id ?? patient._id?.toString(),
      email: patient.email,
      firstName: patient.firstName,
      lastName: patient.lastName,
      role: patient.role,
    };
  }

  private toDoctorProvisionResponse(doctor: {
    _id?: { toString(): string };
    id?: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    specialty: string;
    doctorStatus: DoctorStatus;
  }) {
    return {
      id: doctor.id ?? doctor._id?.toString(),
      email: doctor.email,
      firstName: doctor.firstName,
      lastName: doctor.lastName,
      role: doctor.role,
      specialty: doctor.specialty,
      doctorStatus: doctor.doctorStatus,
    };
  }
}
