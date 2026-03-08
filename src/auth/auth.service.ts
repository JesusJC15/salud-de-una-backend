import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import type { StringValue } from 'ms';
import { Model } from 'mongoose';
import { Admin, AdminDocument } from '../admins/schemas/admin.schema';
import { UserRole } from '../common/enums/user-role.enum';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { Doctor, DoctorDocument } from '../doctors/schemas/doctor.schema';
import { RegisterDoctorDto } from './dto/register-doctor.dto';
import { RegisterPatientDto } from './dto/register-patient.dto';
import { Patient, PatientDocument } from '../patients/schemas/patient.schema';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(Patient.name)
    private readonly patientModel: Model<PatientDocument>,
    @InjectModel(Doctor.name)
    private readonly doctorModel: Model<DoctorDocument>,
    @InjectModel(Admin.name)
    private readonly adminModel: Model<AdminDocument>,
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
      birthDate: dto.birthDate,
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

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const doctor = await this.doctorModel.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      passwordHash,
      specialty: dto.specialty,
      personalId: dto.personalId,
      phoneNumber: dto.phoneNumber,
      rethusNumber: dto.rethusNumber,
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

  async login(email: string, password: string) {
    const authUser = await this.findAuthUser(email);
    if (!authUser) {
      throw new UnauthorizedException('Credenciales invalidas');
    }

    const matches = await bcrypt.compare(password, authUser.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Credenciales invalidas');
    }

    const payload: JwtPayload = {
      sub: authUser.id,
      role: authUser.role,
      email: authUser.email,
      tokenType: 'access',
    };

    const jwtSecret = this.configService.getOrThrow<string>('auth.jwtSecret');
    const accessTokenExpiresIn = this.configService.getOrThrow<StringValue>(
      'auth.accessTokenExpiresIn',
    );
    const refreshTokenExpiresIn = this.configService.getOrThrow<StringValue>(
      'auth.refreshTokenExpiresIn',
    );

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: jwtSecret,
      expiresIn: accessTokenExpiresIn,
    });
    const refreshToken = await this.jwtService.signAsync(
      { ...payload, tokenType: 'refresh' as const },
      {
        secret: jwtSecret,
        expiresIn: refreshTokenExpiresIn,
      },
    );

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: authUser.id,
        email: authUser.email,
        role: authUser.role,
      },
    };
  }

  private async assertEmailDoesNotExist(email: string): Promise<void> {
    const normalized = email.toLowerCase().trim();
    const [patient, doctor, admin] = await Promise.all([
      this.patientModel.findOne({ email: normalized }).lean().exec(),
      this.doctorModel.findOne({ email: normalized }).lean().exec(),
      this.adminModel.findOne({ email: normalized }).lean().exec(),
    ]);

    if (patient || doctor || admin) {
      throw new ConflictException('El correo ya esta registrado');
    }
  }

  private async findAuthUser(email: string) {
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
}
