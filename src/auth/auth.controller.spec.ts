import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
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
    const dto = {
      email: 'ana@example.com',
      password: 'StrongP@ss1',
    } as LoginDto;
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
    const dto = {
      email: 'admin@example.com',
      password: 'AdminP@ss1',
    } as LoginDto;
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
    const dto = { refreshToken: 'rt' } as RefreshTokenDto;
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
    expect(provisioningService.setUserDbId).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: 'existing-id' });
  });
});
