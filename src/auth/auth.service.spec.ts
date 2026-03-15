import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { Admin } from '../admins/schemas/admin.schema';
import { UserRole } from '../common/enums/user-role.enum';
import { Doctor } from '../doctors/schemas/doctor.schema';
import { Patient } from '../patients/schemas/patient.schema';
import { AuthService } from './auth.service';
import { UserGender } from '../common/enums/user-gender.enum';
import { RefreshSession } from './schemas/refresh-session.schema';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

type BaseMockModel = {
  create: jest.Mock;
  findOne: jest.Mock;
  findById?: jest.Mock;
};

type RefreshSessionMockModel = BaseMockModel & {
  find: jest.Mock;
  updateMany: jest.Mock;
  updateOne?: jest.Mock;
  findOneAndUpdate?: jest.Mock;
};

function createFindOneChain(result: unknown) {
  return {
    lean: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(result),
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let patientModel: BaseMockModel;
  let doctorModel: BaseMockModel;
  let adminModel: BaseMockModel;
  let refreshSessionModel: RefreshSessionMockModel;
  let jwtService: {
    signAsync: jest.Mock;
    decode: jest.Mock;
    verifyAsync: jest.Mock;
  };
  let configService: { getOrThrow: jest.Mock; get: jest.Mock };

  beforeEach(async () => {
    patientModel = {
      create: jest.fn(),
      findOne: jest.fn(),
      findById: jest.fn(),
    };

    doctorModel = {
      create: jest.fn(),
      findOne: jest.fn(),
      findById: jest.fn(),
    };

    adminModel = {
      create: jest.fn(),
      findOne: jest.fn(),
      findById: jest.fn(),
    };

    refreshSessionModel = {
      create: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      updateMany: jest.fn(),
      updateOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
    };

    jwtService = {
      signAsync: jest
        .fn()
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token'),
      decode: jest
        .fn()
        .mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 }),
      verifyAsync: jest.fn(),
    };

    configService = {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'auth.jwtSecret')
          return 'test-secret-12345678901234567890123456789012';
        if (key === 'auth.jwtRefreshSecret')
          return 'refresh-secret-12345678901234567890123456789';
        if (key === 'auth.accessTokenExpiresIn') return '1h';
        if (key === 'auth.refreshTokenExpiresIn') return '7d';
        return undefined;
      }),
      get: jest.fn((key: string) => {
        if (key === 'web.refreshMaxActiveSessions') {
          return 3;
        }
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getModelToken(Patient.name),
          useValue: patientModel,
        },
        {
          provide: getModelToken(Doctor.name),
          useValue: doctorModel,
        },
        {
          provide: getModelToken(Admin.name),
          useValue: adminModel,
        },
        {
          provide: getModelToken(RefreshSession.name),
          useValue: refreshSessionModel,
        },
        {
          provide: JwtService,
          useValue: jwtService,
        },
        {
          provide: ConfigService,
          useValue: configService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('registerPatient should create user and return safe payload', async () => {
    patientModel.findOne.mockReturnValue(createFindOneChain(null));
    doctorModel.findOne.mockReturnValue(createFindOneChain(null));
    adminModel.findOne.mockReturnValue(createFindOneChain(null));

    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-pass');
    patientModel.create.mockResolvedValue({
      id: 'p1',
      firstName: 'Ana',
      lastName: 'Lopez',
      email: 'ana@example.com',
      role: UserRole.PATIENT,
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
    });

    const result = await service.registerPatient({
      firstName: 'Ana',
      lastName: 'Lopez',
      email: 'ana@example.com',
      password: 'StrongP@ss1',
      birthDate: '1998-03-10',
      gender: 'FEMALE' as UserGender,
    });

    expect(patientModel.create).toHaveBeenCalled();
    expect(result).toEqual({
      id: 'p1',
      firstName: 'Ana',
      lastName: 'Lopez',
      email: 'ana@example.com',
      role: UserRole.PATIENT,
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
    });
  });

  it('registerPatient should fail on duplicated email', async () => {
    patientModel.findOne.mockReturnValue(createFindOneChain({ _id: 'exists' }));
    doctorModel.findOne.mockReturnValue(createFindOneChain(null));
    adminModel.findOne.mockReturnValue(createFindOneChain(null));

    await expect(
      service.registerPatient({
        firstName: 'Ana',
        lastName: 'Lopez',
        email: 'ana@example.com',
        password: 'StrongP@ss1',
        birthDate: '1998-03-10',
        gender: 'FEMALE' as UserGender,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('loginPatient should return access/refresh tokens and user info', async () => {
    patientModel.findOne.mockReturnValueOnce(
      createFindOneChain({
        id: 'p1',
        email: 'ana@example.com',
        passwordHash: 'hashed-pass',
      }),
    );

    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-refresh-token');
    refreshSessionModel.create.mockResolvedValue({});
    refreshSessionModel.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest
        .fn()
        .mockResolvedValue([
          { sessionId: 'new-session' },
          { sessionId: 'old-1' },
          { sessionId: 'old-2' },
        ]),
    });
    refreshSessionModel.updateMany.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
    });

    const session = await service.loginPatient(
      'ana@example.com',
      'StrongP@ss1',
    );

    expect(session).toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: {
        id: 'p1',
        email: 'ana@example.com',
        role: UserRole.PATIENT,
      },
    });
    expect(typeof session.refreshSessionId).toBe('string');
    expect(session.refreshSessionId.length).toBeGreaterThan(0);
    expect(refreshSessionModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'p1',
        email: 'ana@example.com',
        role: UserRole.PATIENT,
        tokenHash: 'hashed-refresh-token',
      }),
    );
    expect(refreshSessionModel.find).toHaveBeenCalled();
  });

  it('loginPatient should fail with invalid credentials when user is not found', async () => {
    patientModel.findOne.mockReturnValue(createFindOneChain(null));
    doctorModel.findOne.mockReturnValue(createFindOneChain(null));
    adminModel.findOne.mockReturnValue(createFindOneChain(null));

    await expect(
      service.loginPatient('missing@example.com', 'whatever'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('loginPatient should fail with invalid credentials when password does not match', async () => {
    patientModel.findOne.mockReturnValueOnce(
      createFindOneChain({
        id: 'p1',
        email: 'ana@example.com',
        passwordHash: 'hashed-pass',
      }),
    );
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(
      service.loginPatient('ana@example.com', 'wrong-pass'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('loginStaff should fail when patient credentials are used', async () => {
    doctorModel.findOne.mockReturnValue(createFindOneChain(null));
    adminModel.findOne.mockReturnValue(createFindOneChain(null));

    await expect(
      service.loginStaff('ana@example.com', 'StrongP@ss1'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('registerDoctor should fail when personalId is empty', async () => {
    patientModel.findOne.mockReturnValue(createFindOneChain(null));
    doctorModel.findOne.mockReturnValue(createFindOneChain(null));
    adminModel.findOne.mockReturnValue(createFindOneChain(null));

    await expect(
      service.registerDoctor({
        firstName: 'Laura',
        lastName: 'Medina',
        email: 'doc@example.com',
        password: 'StrongP@ss1',
        specialty: 'GENERAL_MEDICINE',
        personalId: '   ',
        phoneNumber: '3001234567',
        professionalLicense: 'P-123',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('registerDoctor should map duplicate personalId to ConflictException', async () => {
    patientModel.findOne.mockReturnValue(createFindOneChain(null));
    doctorModel.findOne.mockReturnValue(createFindOneChain(null));
    adminModel.findOne.mockReturnValue(createFindOneChain(null));
    doctorModel.create.mockRejectedValue({
      code: 11000,
      keyPattern: { personalId: 1 },
    });

    await expect(
      service.registerDoctor({
        firstName: 'Laura',
        lastName: 'Medina',
        email: 'doc@example.com',
        password: 'StrongP@ss1',
        specialty: 'GENERAL_MEDICINE',
        personalId: 'CC-123',
        phoneNumber: '3001234567',
        professionalLicense: 'P-123',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('registerDoctor should map duplicate email to ConflictException', async () => {
    patientModel.findOne.mockReturnValue(createFindOneChain(null));
    doctorModel.findOne.mockReturnValue(createFindOneChain(null));
    adminModel.findOne.mockReturnValue(createFindOneChain(null));
    doctorModel.create.mockRejectedValue({
      code: 11000,
      keyPattern: { email: 1 },
    });

    await expect(
      service.registerDoctor({
        firstName: 'Laura',
        lastName: 'Medina',
        email: 'doc@example.com',
        password: 'StrongP@ss1',
        specialty: 'GENERAL_MEDICINE',
        personalId: 'CC-123',
        phoneNumber: '3001234567',
        professionalLicense: 'P-123',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('registerDoctor should fail when personalId already exists', async () => {
    patientModel.findOne.mockReturnValue(createFindOneChain(null));
    doctorModel.findOne
      .mockReturnValueOnce(createFindOneChain(null))
      .mockReturnValueOnce(createFindOneChain({ _id: 'exists' }));
    adminModel.findOne.mockReturnValue(createFindOneChain(null));

    await expect(
      service.registerDoctor({
        firstName: 'Laura',
        lastName: 'Medina',
        email: 'doc@example.com',
        password: 'StrongP@ss1',
        specialty: 'GENERAL_MEDICINE',
        personalId: 'CC-123',
        phoneNumber: '3001234567',
        professionalLicense: 'P-123',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refreshTokens should fail without token', async () => {
    await expect(service.refreshTokens()).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refreshTokens should fail on invalid token', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('invalid'));
    await expect(service.refreshTokens('bad-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refreshTokens should fail when tokenType is not refresh', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'u1',
      role: UserRole.PATIENT,
      email: 'ana@example.com',
      tokenType: 'access',
    });

    await expect(service.refreshTokens('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refreshTokens should fail when jti is missing', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'u1',
      role: UserRole.PATIENT,
      email: 'ana@example.com',
      tokenType: 'refresh',
    });

    await expect(service.refreshTokens('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refreshTokens should fail when session does not exist', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'u1',
      role: UserRole.PATIENT,
      email: 'ana@example.com',
      tokenType: 'refresh',
      jti: 'session-1',
    });
    refreshSessionModel.findOne.mockReturnValue(createFindOneChain(null));

    await expect(service.refreshTokens('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refreshTokens should fail when refresh token hash does not match', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'u1',
      role: UserRole.PATIENT,
      email: 'ana@example.com',
      tokenType: 'refresh',
      jti: 'session-1',
    });
    refreshSessionModel.findOne.mockReturnValue(
      createFindOneChain({
        sessionId: 'session-1',
        userId: 'u1',
        role: UserRole.PATIENT,
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 60_000),
      }),
    );
    refreshSessionModel.findOneAndUpdate.mockReturnValue(
      createFindOneChain({
        sessionId: 'session-1',
      }),
    );
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(service.refreshTokens('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refreshTokens should fail when refresh session is expired', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'u1',
      role: UserRole.PATIENT,
      email: 'ana@example.com',
      tokenType: 'refresh',
      jti: 'session-1',
    });
    refreshSessionModel.findOne.mockReturnValue(
      createFindOneChain({
        sessionId: 'session-1',
        userId: 'u1',
        role: UserRole.PATIENT,
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() - 1000),
      }),
    );
    refreshSessionModel.updateOne?.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    });

    await expect(service.refreshTokens('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(refreshSessionModel.updateOne).toHaveBeenCalled();
  });

  it('refreshTokens should fail when session cannot be consumed', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'u1',
      role: UserRole.PATIENT,
      email: 'ana@example.com',
      tokenType: 'refresh',
      jti: 'session-1',
    });
    refreshSessionModel.findOne.mockReturnValue(
      createFindOneChain({
        sessionId: 'session-1',
        userId: 'u1',
        role: UserRole.PATIENT,
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 60_000),
      }),
    );
    refreshSessionModel.findOneAndUpdate?.mockReturnValue(
      createFindOneChain(null),
    );
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    await expect(service.refreshTokens('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refreshTokens should return new session when valid', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'u1',
      role: UserRole.PATIENT,
      email: 'ana@example.com',
      tokenType: 'refresh',
      jti: 'session-1',
    });
    refreshSessionModel.findOne.mockReturnValue(
      createFindOneChain({
        sessionId: 'session-1',
        userId: 'u1',
        role: UserRole.PATIENT,
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 60_000),
      }),
    );
    refreshSessionModel.findOneAndUpdate.mockReturnValue(
      createFindOneChain({
        sessionId: 'session-1',
      }),
    );
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    patientModel.findById?.mockReturnValue(
      createFindOneChain({
        _id: 'u1',
        email: 'ana@example.com',
        role: UserRole.PATIENT,
        isActive: true,
      }),
    );
    jwtService.signAsync
      .mockResolvedValueOnce('access')
      .mockResolvedValueOnce('refresh');
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-refresh-token');
    refreshSessionModel.create.mockResolvedValue({});
    refreshSessionModel.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([{ sessionId: 'session-1' }]),
    });
    refreshSessionModel.updateMany.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
    });

    const session = await service.refreshTokens('token');

    expect(session).toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: { id: 'u1', email: 'ana@example.com', role: UserRole.PATIENT },
    });
  });

  it('revokeRefreshSession should be noop without token', async () => {
    await expect(service.revokeRefreshSession()).resolves.toBeUndefined();
  });

  it('revokeRefreshSession should ignore invalid token', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('invalid'));
    await expect(service.revokeRefreshSession('bad')).resolves.toBeUndefined();
  });

  it('revokeRefreshSession should revoke when token is valid', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'u1',
      role: UserRole.PATIENT,
      email: 'ana@example.com',
      tokenType: 'refresh',
      jti: 'session-1',
    });
    refreshSessionModel.updateOne?.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    });

    await expect(
      service.revokeRefreshSession('token'),
    ).resolves.toBeUndefined();
    expect(refreshSessionModel.updateOne).toHaveBeenCalled();
  });

  it('buildSession should revoke previous session and enforce session limit', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'web.refreshMaxActiveSessions') return 1;
      return undefined;
    });
    jwtService.signAsync
      .mockResolvedValueOnce('access')
      .mockResolvedValueOnce('refresh');
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-token');
    refreshSessionModel.create.mockResolvedValue({});
    refreshSessionModel.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest
        .fn()
        .mockResolvedValue([
          { sessionId: 'new-session' },
          { sessionId: 'old-1' },
          { sessionId: 'old-2' },
        ]),
    });
    refreshSessionModel.updateMany.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ modifiedCount: 2 }),
    });
    refreshSessionModel.updateOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    });

    const result = await (service as any).buildSession(
      { id: 'u1', email: 'ana@example.com', role: UserRole.PATIENT },
      'previous-session',
    );

    expect(result.accessToken).toBe('access-token');
    expect(refreshSessionModel.updateOne).toHaveBeenCalled();
    expect(refreshSessionModel.updateMany).toHaveBeenCalled();
  });

  it('buildSession should set fallback expiry when decode has no exp', async () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    jwtService.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-refresh-token');
    jwtService.decode.mockReturnValue(null);
    refreshSessionModel.create.mockResolvedValue({});
    refreshSessionModel.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([{ sessionId: 'session-1' }]),
    });
    refreshSessionModel.updateMany.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
    });

    const result = await (service as any).buildSession({
      id: 'u1',
      email: 'ana@example.com',
      role: UserRole.PATIENT,
    });

    const createPayload = refreshSessionModel.create.mock.calls[0][0];
    expect(createPayload.expiresAt.getTime()).toBeGreaterThan(now);
    expect(result.accessToken).toBe('access-token');
    (Date.now as jest.Mock).mockRestore();
  });

  it('findAuthUserById should return null for inactive patient', async () => {
    patientModel.findById?.mockReturnValue(
      createFindOneChain({
        email: 'ana@example.com',
        role: UserRole.PATIENT,
        isActive: false,
      }),
    );

    const result = await (service as any).findAuthUserById(
      'u1',
      UserRole.PATIENT,
    );

    expect(result).toBeNull();
  });

  it('findAuthUserById should resolve admin user', async () => {
    adminModel.findById?.mockReturnValue(
      createFindOneChain({
        _id: 'a1',
        email: 'admin@example.com',
        role: UserRole.ADMIN,
        isActive: true,
      }),
    );

    const result = await (service as any).findAuthUserById(
      'a1',
      UserRole.ADMIN,
    );

    expect(result).toEqual({
      id: 'a1',
      email: 'admin@example.com',
      role: UserRole.ADMIN,
    });
  });

  it('loginStaff should login doctor successfully', async () => {
    doctorModel.findOne.mockReturnValue(
      createFindOneChain({
        id: 'd1',
        email: 'doc@example.com',
        passwordHash: 'hash',
      }),
    );

    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-refresh');

    refreshSessionModel.create.mockResolvedValue({});
    refreshSessionModel.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([{ sessionId: 'session-1' }]),
    });

    refreshSessionModel.updateMany.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
    });

    const result = await service.loginStaff('doc@example.com', 'StrongP@ss1');

    expect(result.user).toEqual({
      id: 'd1',
      email: 'doc@example.com',
      role: UserRole.DOCTOR,
    });
  });

  it('registerDoctor should create doctor successfully', async () => {
    patientModel.findOne.mockReturnValue(createFindOneChain(null));
    doctorModel.findOne.mockReturnValue(createFindOneChain(null));
    adminModel.findOne.mockReturnValue(createFindOneChain(null));

    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');

    doctorModel.create.mockResolvedValue({
      id: 'd1',
      firstName: 'Laura',
      lastName: 'Medina',
      email: 'doc@example.com',
      role: UserRole.DOCTOR,
      specialty: 'GENERAL_MEDICINE',
      doctorStatus: 'PENDING',
      createdAt: new Date(),
    });

    const result = await service.registerDoctor({
      firstName: 'Laura',
      lastName: 'Medina',
      email: 'doc@example.com',
      password: 'StrongP@ss1',
      specialty: 'GENERAL_MEDICINE',
      personalId: 'CC123',
      phoneNumber: '3001234567',
      professionalLicense: 'P123',
    });

    expect(result.role).toBe(UserRole.DOCTOR);
  });

  it('assertPersonalIdDoesNotExist should throw on empty id', async () => {
    await expect(
      (service as any).assertPersonalIdDoesNotExist('   '),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('me should return current user payload', () => {
    const result = service.me({
      userId: 'u1',
      email: 'ana@example.com',
      role: UserRole.PATIENT,
      isActive: true,
    } as any);

    expect(result).toEqual({
      user: {
        id: 'u1',
        email: 'ana@example.com',
        role: UserRole.PATIENT,
        isActive: true,
      },
    });
  });

  it('findAuthUserById should resolve doctor user', async () => {
    doctorModel.findById.mockReturnValue(
      createFindOneChain({
        _id: 'd1',
        email: 'doc@example.com',
        role: UserRole.DOCTOR,
        isActive: true,
      }),
    );

    const result = await (service as any).findAuthUserById(
      'd1',
      UserRole.DOCTOR,
    );

    expect(result).toEqual({
      id: 'd1',
      email: 'doc@example.com',
      role: UserRole.DOCTOR,
    });
  });

  it('findAuthUserById should resolve patient user', async () => {
    patientModel.findById.mockReturnValue(
      createFindOneChain({
        _id: 'p1',
        email: 'ana@example.com',
        role: UserRole.PATIENT,
        isActive: true,
      }),
    );

    const result = await (service as any).findAuthUserById(
      'p1',
      UserRole.PATIENT,
    );

    expect(result).toEqual({
      id: 'p1',
      email: 'ana@example.com',
      role: UserRole.PATIENT,
    });
  });

  it('enforceActiveSessionLimit should do nothing when under limit', async () => {
    configService.get.mockReturnValue(5);

    refreshSessionModel.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([{ sessionId: 's1' }]),
    });

    await (service as any).enforceActiveSessionLimit(
      'u1',
      UserRole.PATIENT,
      's1',
    );

    expect(refreshSessionModel.updateMany).not.toHaveBeenCalled();
  });


});
