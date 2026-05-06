import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { Doctor } from '../doctors/schemas/doctor.schema';
import { Patient } from '../patients/schemas/patient.schema';
import { UserRole } from '../common/enums/user-role.enum';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDoctorDto } from './dto/register-doctor.dto';
import { RegisterPatientDto } from './dto/register-patient.dto';
import { ProvisioningService } from './provisioning.service';
import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    registerPatient: jest.Mock;
    registerDoctor: jest.Mock;
    loginPatient: jest.Mock;
    loginStaff: jest.Mock;
    refreshTokens: jest.Mock;
    revokeRefreshSession: jest.Mock;
    me: jest.Mock;
    ensureEmailIsAvailable: jest.Mock;
  };
  let provisioningService: { setUserDbId: jest.Mock };
  let patientModel: { findOne: jest.Mock; create: jest.Mock };
  let doctorModel: { findOne: jest.Mock; create: jest.Mock };

  beforeEach(async () => {
    authService = {
      registerPatient: jest.fn(),
      registerDoctor: jest.fn(),
      loginPatient: jest.fn(),
      loginStaff: jest.fn(),
      refreshTokens: jest.fn(),
      revokeRefreshSession: jest.fn(),
      me: jest.fn(),
      ensureEmailIsAvailable: jest.fn(),
    };

    provisioningService = {
      setUserDbId: jest.fn().mockResolvedValue(undefined),
    };
    patientModel = { findOne: jest.fn(), create: jest.fn() };
    doctorModel = { findOne: jest.fn(), create: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: ProvisioningService, useValue: provisioningService },
        { provide: getModelToken(Patient.name), useValue: patientModel },
        { provide: getModelToken(Doctor.name), useValue: doctorModel },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  // ── Legacy endpoints ────────────────────────────────────────────────────────

  it('registerPatient should call service', async () => {
    const dto = {
      firstName: 'Ana',
      lastName: 'Lopez',
      email: 'ana@example.com',
      password: 'StrongP@ss1',
    } as RegisterPatientDto;
    authService.registerPatient.mockResolvedValue({ id: 'p1' });

    const result = await controller.registerPatient(dto);

    expect(authService.registerPatient).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ id: 'p1' });
  });

  it('registerDoctor should call service', async () => {
    const dto = {
      firstName: 'Laura',
      lastName: 'Medina',
      email: 'doc@example.com',
      password: 'StrongP@ss1',
      specialty: 'GENERAL_MEDICINE',
      personalId: 'CC-123',
      phoneNumber: '3001234567',
    } as RegisterDoctorDto;
    authService.registerDoctor.mockResolvedValue({ id: 'd1' });

    const result = await controller.registerDoctor(dto);

    expect(authService.registerDoctor).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ id: 'd1' });
  });

  it('loginPatient should map session payload', async () => {
    const dto: LoginDto = {
      email: 'ana@example.com',
      password: 'StrongP@ss1',
    };
    authService.loginPatient.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'p1', email: 'ana@example.com', role: 'PATIENT' },
    });

    const result = await controller.loginPatient(dto);

    expect(authService.loginPatient).toHaveBeenCalledWith(
      dto.email,
      dto.password,
    );
    expect(result).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'p1', email: 'ana@example.com', role: 'PATIENT' },
    });
  });

  it('loginStaff should map session payload', async () => {
    const dto: LoginDto = {
      email: 'admin@example.com',
      password: 'AdminP@ss1',
    };
    authService.loginStaff.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'a1', email: 'admin@example.com', role: 'ADMIN' },
    });

    const result = await controller.loginStaff(dto);

    expect(authService.loginStaff).toHaveBeenCalledWith(
      dto.email,
      dto.password,
    );
    expect(result).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'a1', email: 'admin@example.com', role: 'ADMIN' },
    });
  });

  it('refresh should call service and map session', async () => {
    const dto: RefreshTokenDto = { refreshToken: 'rt' };
    authService.refreshTokens.mockResolvedValue({
      accessToken: 'a2',
      refreshToken: 'r2',
      user: { id: 'p2', email: 'p2@example.com', role: 'PATIENT' },
    });

    const result = await controller.refresh(dto);

    expect(authService.refreshTokens).toHaveBeenCalledWith(dto.refreshToken);
    expect(result).toEqual({
      accessToken: 'a2',
      refreshToken: 'r2',
      user: { id: 'p2', email: 'p2@example.com', role: 'PATIENT' },
    });
  });

  it('logout should revoke session and return message', async () => {
    const dto = { refreshToken: 'rt' } as LogoutDto;

    const result = await controller.logout(dto);

    expect(authService.revokeRefreshSession).toHaveBeenCalledWith(
      dto.refreshToken,
    );
    expect(result).toEqual({ message: 'Sesion cerrada' });
  });

  it('me should return user info from service', () => {
    authService.me.mockReturnValue({
      user: { id: 'p1', email: 'ana@example.com', role: 'PATIENT' },
    });

    const result = controller.me({
      user: {
        userId: 'p1',
        email: 'ana@example.com',
        role: UserRole.PATIENT,
        isActive: true,
      },
    } as never);

    expect(result).toEqual({
      user: { id: 'p1', email: 'ana@example.com', role: 'PATIENT' },
    });
  });

  // ── Provisioning endpoints ─────────────────────────────────────────────────

  it('provisionPatient should create patient and call provisioning service', async () => {
    const auth0UserId = 'auth0|abc123';
    const email = 'ana@example.com';
    const mockPatient = {
      id: 'mongo-id-1',
      _id: { toString: () => 'mongo-id-1' },
      email,
      firstName: 'Ana',
      lastName: 'Lopez',
      role: UserRole.PATIENT,
    };

    patientModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(null),
    });
    authService.ensureEmailIsAvailable.mockResolvedValue(undefined);
    patientModel.create.mockResolvedValue(mockPatient);

    const result = await controller.provisionPatient(
      { user: { auth0UserId, email } } as never,
      { firstName: 'Ana', lastName: 'Lopez' },
    );

    expect(patientModel.create).toHaveBeenCalled();
    expect(provisioningService.setUserDbId).toHaveBeenCalledWith(
      auth0UserId,
      'mongo-id-1',
      UserRole.PATIENT,
    );
    expect(result).toMatchObject({
      id: 'mongo-id-1',
      email,
      role: UserRole.PATIENT,
    });
  });

  it('provisionPatient should fail when Auth0 token has no email', async () => {
    await expect(
      controller.provisionPatient(
        {
          user: { auth0UserId: 'auth0|abc123', email: undefined },
        } as never,
        { firstName: 'Ana', lastName: 'Lopez' },
      ),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('provisionPatient should return existing patient if already provisioned (idempotent)', async () => {
    const auth0UserId = 'auth0|abc123';
    const email = 'ana@example.com';
    const existing = {
      id: 'existing-id',
      _id: { toString: () => 'existing-id' },
      email,
      firstName: 'Ana',
      lastName: 'Lopez',
      role: UserRole.PATIENT,
    };

    patientModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(existing),
    });

    const result = await controller.provisionPatient(
      { user: { auth0UserId, email } } as never,
      { firstName: 'Ana', lastName: 'Lopez' },
    );

    expect(patientModel.create).not.toHaveBeenCalled();
    // setUserDbId is called even for existing patients to ensure the Auth0
    // user is linked to the MongoDB profile (idempotent operation).
    expect(provisioningService.setUserDbId).toHaveBeenCalledWith(
      'auth0|abc123',
      'existing-id',
      UserRole.PATIENT,
    );
    expect(result).toMatchObject({ id: 'existing-id' });
  });

  it('provisionDoctor should reject incomplete doctor payloads', async () => {
    doctorModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(null),
    });

    await expect(
      controller.provisionDoctor(
        {
          user: { auth0UserId: 'auth0|doc', email: 'doc@example.com' },
        } as never,
        {
          firstName: 'Laura',
          lastName: 'Medina',
        },
      ),
    ).rejects.toThrow(
      'firstName, lastName, specialty, personalId y phoneNumber',
    );
  });

  it('provisionDoctor should fail when Auth0 token has no email', async () => {
    await expect(
      controller.provisionDoctor(
        {
          user: { auth0UserId: 'auth0|doc', email: undefined },
        } as never,
        {
          firstName: 'Laura',
          lastName: 'Medina',
          specialty: 'GENERAL_MEDICINE',
          personalId: 'CC-123',
          phoneNumber: '3001234567',
        },
      ),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('provisionDoctor should return existing doctor when already provisioned', async () => {
    doctorModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue({
        _id: { toString: () => 'doctor-existing' },
        email: 'doc@example.com',
        firstName: 'Laura',
        lastName: 'Medina',
        role: UserRole.DOCTOR,
        specialty: 'GENERAL_MEDICINE',
        doctorStatus: 'PENDING',
      }),
    });

    const result = await controller.provisionDoctor(
      {
        user: { auth0UserId: 'auth0|doc', email: 'doc@example.com' },
      } as never,
      {
        firstName: 'Laura',
        lastName: 'Medina',
        specialty: 'GENERAL_MEDICINE',
        personalId: 'CC-123',
        phoneNumber: '3001234567',
      },
    );

    expect(provisioningService.setUserDbId).toHaveBeenCalledWith(
      'auth0|doc',
      'doctor-existing',
      UserRole.DOCTOR,
    );
    expect(doctorModel.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      id: 'doctor-existing',
      role: UserRole.DOCTOR,
      specialty: 'GENERAL_MEDICINE',
    });
  });

  it('provisionDoctor should reject duplicated personalId', async () => {
    doctorModel.findOne
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      })
      .mockReturnValueOnce({
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue({ _id: 'existing' }),
      });
    authService.ensureEmailIsAvailable.mockResolvedValue(undefined);

    await expect(
      controller.provisionDoctor(
        {
          user: { auth0UserId: 'auth0|doc', email: 'doc@example.com' },
        } as never,
        {
          firstName: 'Laura',
          lastName: 'Medina',
          specialty: 'GENERAL_MEDICINE',
          personalId: 'CC-123',
          phoneNumber: '3001234567',
        },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('provisionDoctor should create doctor and link Auth0 user', async () => {
    doctorModel.findOne
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      })
      .mockReturnValueOnce({
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      });
    authService.ensureEmailIsAvailable.mockResolvedValue(undefined);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-auth0');
    doctorModel.create.mockResolvedValue({
      id: 'doctor-1',
      email: 'doc@example.com',
      firstName: 'Laura',
      lastName: 'Medina',
      role: UserRole.DOCTOR,
      specialty: 'GENERAL_MEDICINE',
      doctorStatus: 'PENDING',
    });

    const result = await controller.provisionDoctor(
      {
        user: { auth0UserId: 'auth0|doc', email: 'doc@example.com' },
      } as never,
      {
        firstName: 'Laura',
        lastName: 'Medina',
        specialty: 'GENERAL_MEDICINE',
        personalId: 'CC-123',
        phoneNumber: '3001234567',
      },
    );

    expect(provisioningService.setUserDbId).toHaveBeenCalledWith(
      'auth0|doc',
      'doctor-1',
      UserRole.DOCTOR,
    );
    expect(result).toMatchObject({
      id: 'doctor-1',
      specialty: 'GENERAL_MEDICINE',
      role: UserRole.DOCTOR,
    });
  });

  it('migrateCheck should reject requests without the migration key', async () => {
    const previous = process.env.AUTH0_MIGRATION_KEY;
    process.env.AUTH0_MIGRATION_KEY = 'expected-key';

    await expect(
      controller.migrateCheck(
        {
          headers: { 'x-migration-key': 'wrong-key' },
        } as never,
        { email: 'ana@example.com', password: 'StrongP@ss1' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    process.env.AUTH0_MIGRATION_KEY = previous;
  });

  it('migrateCheck should return the patient payload when credentials match', async () => {
    const previous = process.env.AUTH0_MIGRATION_KEY;
    process.env.AUTH0_MIGRATION_KEY = 'expected-key';
    patientModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue({
        _id: { toString: () => 'patient-1' },
        email: 'ana@example.com',
        passwordHash: 'hash',
        firstName: 'Ana',
        lastName: 'Lopez',
      }),
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const result = await controller.migrateCheck(
      {
        headers: { 'x-migration-key': 'expected-key' },
      } as never,
      { email: 'ana@example.com', password: 'StrongP@ss1' },
    );

    expect(result).toEqual({
      user_id: 'patient-1',
      email: 'ana@example.com',
      role: UserRole.PATIENT,
      firstName: 'Ana',
      lastName: 'Lopez',
    });
    process.env.AUTH0_MIGRATION_KEY = previous;
  });

  it('migrateCheck should reject invalid patient credentials', async () => {
    const previous = process.env.AUTH0_MIGRATION_KEY;
    process.env.AUTH0_MIGRATION_KEY = 'expected-key';
    patientModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue({
        _id: { toString: () => 'patient-1' },
        email: 'ana@example.com',
        passwordHash: 'hash',
        firstName: 'Ana',
        lastName: 'Lopez',
      }),
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(
      controller.migrateCheck(
        {
          headers: { 'x-migration-key': 'expected-key' },
        } as never,
        { email: 'ana@example.com', password: 'WrongPass' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    process.env.AUTH0_MIGRATION_KEY = previous;
  });

  it('migrateCheck should reject invalid doctor credentials', async () => {
    const previous = process.env.AUTH0_MIGRATION_KEY;
    process.env.AUTH0_MIGRATION_KEY = 'expected-key';
    patientModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(null),
    });
    doctorModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue({
        _id: { toString: () => 'doctor-1' },
        email: 'doc@example.com',
        passwordHash: 'hash',
        firstName: 'Laura',
        lastName: 'Medina',
      }),
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(
      controller.migrateCheck(
        {
          headers: { 'x-migration-key': 'expected-key' },
        } as never,
        { email: 'doc@example.com', password: 'WrongPass' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    process.env.AUTH0_MIGRATION_KEY = previous;
  });

  it('migrateCheck should return the doctor payload when patient is not found and doctor matches', async () => {
    const previous = process.env.AUTH0_MIGRATION_KEY;
    process.env.AUTH0_MIGRATION_KEY = 'expected-key';
    patientModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(null),
    });
    doctorModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue({
        _id: { toString: () => 'doctor-1' },
        email: 'doc@example.com',
        passwordHash: 'hash',
        firstName: 'Laura',
        lastName: 'Medina',
      }),
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const result = await controller.migrateCheck(
      {
        headers: { 'x-migration-key': 'expected-key' },
      } as never,
      { email: 'doc@example.com', password: 'StrongP@ss1' },
    );

    expect(result).toEqual({
      user_id: 'doctor-1',
      email: 'doc@example.com',
      role: UserRole.DOCTOR,
      firstName: 'Laura',
      lastName: 'Medina',
    });
    process.env.AUTH0_MIGRATION_KEY = previous;
  });

  it('migrateCheck should fail when neither patient nor doctor exists', async () => {
    const previous = process.env.AUTH0_MIGRATION_KEY;
    process.env.AUTH0_MIGRATION_KEY = 'expected-key';
    patientModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(null),
    });
    doctorModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(null),
    });

    await expect(
      controller.migrateCheck(
        {
          headers: { 'x-migration-key': 'expected-key' },
        } as never,
        { email: 'ghost@example.com', password: 'StrongP@ss1' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    process.env.AUTH0_MIGRATION_KEY = previous;
  });
});
