import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  Optional,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import * as bcrypt from 'bcrypt';
import { Public } from '../common/decorators/public.decorator';
import { DoctorStatus } from '../common/enums/doctor-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import type { RequestContext } from '../common/interfaces/request-context.interface';
import { Doctor, DoctorDocument } from '../doctors/schemas/doctor.schema';
import { Patient, PatientDocument } from '../patients/schemas/patient.schema';
import { AuthService } from './auth.service';
import { AuthMeResponseDto } from './dto/auth-me.response.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { ProvisionDoctorDto } from './dto/provision-doctor.dto';
import { ProvisionPatientDto } from './dto/provision-patient.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDoctorDto } from './dto/register-doctor.dto';
import { RegisterPatientDto } from './dto/register-patient.dto';
import { ProvisioningService } from './provisioning.service';
import type { ProvisionUser } from './strategies/jwt-provision.strategy';
import { Model } from 'mongoose';

interface ProvisionRequestContext extends Omit<RequestContext, 'user'> {
  user: ProvisionUser;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Optional()
    private readonly provisioningService?: ProvisioningService,
    @Optional()
    @InjectModel(Patient.name)
    private readonly patientModel?: Model<PatientDocument>,
    @Optional()
    @InjectModel(Doctor.name)
    private readonly doctorModel?: Model<DoctorDocument>,
  ) {}

  @Post('provision/patient')
  @Public()
  @UseGuards(AuthGuard('jwt-provision'))
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async provisionPatient(
    @Req() req: ProvisionRequestContext,
    @Body() dto: ProvisionPatientDto,
  ) {
    if (typeof this.authService.provisionPatientWithAuth0 === 'function') {
      return this.authService.provisionPatientWithAuth0(
        dto,
        req.headers?.authorization,
      );
    }

    const { auth0UserId, email } = req.user;

    if (!email) {
      throw new InternalServerErrorException(
        'Token de Auth0 no incluye email. Asegurate de solicitar el scope "email".',
      );
    }

    const existing = await this.patientModel!.findOne({
      email: email.toLowerCase().trim(),
    })
      .select('_id email firstName lastName role')
      .lean()
      .exec();

    if (existing) {
      await this.provisioningService?.setUserDbId(
        auth0UserId,
        existing._id?.toString() ?? (existing as { id?: string }).id ?? '',
        UserRole.PATIENT,
      );
      return {
        id: (existing as { id?: string }).id ?? existing._id?.toString(),
        email: existing.email,
        firstName: existing.firstName,
        lastName: existing.lastName,
        role: existing.role,
      };
    }

    void req.user;
    await this.authService.ensureEmailIsAvailable(email);

    const patient = await this.patientModel!.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: email.toLowerCase().trim(),
      passwordHash: await bcrypt.hash(auth0UserId, 8),
      birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
      gender: dto.gender,
    });

    await this.provisioningService?.setUserDbId(
      auth0UserId,
      patient.id,
      UserRole.PATIENT,
    );

    return {
      id: patient.id,
      email: patient.email,
      firstName: patient.firstName,
      lastName: patient.lastName,
      role: patient.role,
    };
  }

  @Post('provision/doctor')
  @Public()
  @UseGuards(AuthGuard('jwt-provision'))
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async provisionDoctor(
    @Req() req: ProvisionRequestContext,
    @Body() dto: ProvisionDoctorDto,
  ) {
    if (typeof this.authService.provisionDoctorWithAuth0 === 'function') {
      return this.authService.provisionDoctorWithAuth0(
        dto,
        req.headers?.authorization,
      );
    }

    const { auth0UserId, email } = req.user;

    if (!email) {
      throw new InternalServerErrorException(
        'Token de Auth0 no incluye email. Asegurate de solicitar el scope "email".',
      );
    }

    const existing = await this.doctorModel!.findOne({
      email: email.toLowerCase().trim(),
    })
      .select('_id email firstName lastName role specialty doctorStatus')
      .lean()
      .exec();

    if (existing) {
      await this.provisioningService?.setUserDbId(
        auth0UserId,
        existing._id?.toString() ?? (existing as { id?: string }).id ?? '',
        UserRole.DOCTOR,
      );
      return {
        id: (existing as { id?: string }).id ?? existing._id?.toString(),
        email: existing.email,
        firstName: existing.firstName,
        lastName: existing.lastName,
        role: existing.role,
        specialty: existing.specialty,
        doctorStatus: existing.doctorStatus,
      };
    }

    if (
      !dto.firstName ||
      !dto.lastName ||
      !dto.specialty ||
      !dto.personalId ||
      !dto.phoneNumber
    ) {
      throw new BadRequestException(
        'firstName, lastName, specialty, personalId y phoneNumber son obligatorios para registrar un nuevo médico',
      );
    }

    await this.authService.ensureEmailIsAvailable(email);

    const existingPersonalId = await this.doctorModel!.findOne({
      personalId: dto.personalId.trim(),
    })
      .lean()
      .exec();

    if (existingPersonalId) {
      throw new ConflictException('El ID personal ya está registrado');
    }

    const doctor = await this.doctorModel!.create({
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

    await this.provisioningService?.setUserDbId(
      auth0UserId,
      doctor.id,
      UserRole.DOCTOR,
    );

    return {
      id: doctor.id,
      email: doctor.email,
      firstName: doctor.firstName,
      lastName: doctor.lastName,
      role: doctor.role,
      specialty: doctor.specialty,
      doctorStatus: doctor.doctorStatus,
    };
  }

  @Get('me')
  me(@Req() request: RequestContext): AuthMeResponseDto {
    return this.authService.me(request.user!);
  }

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
}
