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
import { Specialty } from '../common/enums/specialty.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { RequestUser } from '../common/interfaces/request-user.interface';
import { Doctor } from '../doctors/schemas/doctor.schema';
import { Patient } from '../patients/schemas/patient.schema';
import { AuthService } from './auth.service';
import { UserGender } from '../common/enums/user-gender.enum';
import { RefreshSession } from './schemas/refresh-session.schema';
import { ProvisioningService } from './provisioning.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

type BaseMockModel = {
  create: jest.Mock;
  findOne: jest.Mock;
};

type UserMockModel = BaseMockModel & {
  findById: jest.Mock;
  updateOne: jest.Mock;
};

type RefreshSessionMockModel = BaseMockModel & {
  find: jest.Mock;
  updateMany: jest.Mock;
  updateOne: jest.Mock;
  findOneAndUpdate: jest.Mock;
};

function createFindOneChain(result: unknown) {
  return {
    lean: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(result),
  };
}

type InternalTokenUser = {
  id: string;
  email: string;
  role: UserRole;
};

type InternalAuthSession = {
  accessToken: string;
  refreshToken: string;
  refreshSessionId: string;
  user: {
    id: string;
    email: string;
    role: UserRole;
  };
};

type RefreshSessionCreatePayload = {
  sessionId: string;
  userId: string;
  email: string;
  role: UserRole;
  tokenHash: string;
  expiresAt: Date;
};

type AuthServiceInternals = {
  buildSession(
    authUser: InternalTokenUser,
    previousSessionId?: string,
  ): Promise<InternalAuthSession>;
  findAuthUserById(
    userId: string,
    role: UserRole,
  ): Promise<InternalTokenUser | null>;
  assertPersonalIdDoesNotExist(personalId: string): Promise<void>;
  enforceActiveSessionLimit(
    userId: string,
    role: UserRole,
    keepSessionId: string,
  ): Promise<void>;
  getJoseModule(): Promise<{
    jwtVerify: jest.Mock;
    createRemoteJWKSet: jest.Mock;
  }>;
  parseUserRole(value: unknown): UserRole | null;
  resolveAuth0Issuer(): string | null;
  extractBearerToken(authorizationHeader?: string): string;
  syncAuth0Subject(
    role: UserRole,
    userId: string,
    auth0Subject: string,
  ): Promise<void>;
  linkAuth0SubjectForResolvedUser(
    user: RequestUser,
    currentAuth0Subject: string | null | undefined,
    nextAuth0Subject: string,
  ): Promise<RequestUser | null>;
  getAuth0Jwks(auth0Issuer: string): Promise<unknown>;
};

describe('AuthService', () => {
  let service: AuthService;
  let patientModel: UserMockModel;
  let doctorModel: UserMockModel;
  let adminModel: UserMockModel;
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
      updateOne: jest.fn(),
    };

    doctorModel = {
      create: jest.fn(),
      findOne: jest.fn(),
      findById: jest.fn(),
      updateOne: jest.fn(),
    };

    adminModel = {
      create: jest.fn(),
      findOne: jest.fn(),
      findById: jest.fn(),
      updateOne: jest.fn(),
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
        {
          provide: ProvisioningService,
          useValue: {
            createAuth0UserFromManualRegistration: jest
              .fn()
              .mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  function getInternals(): AuthServiceInternals {
    return service as unknown as AuthServiceInternals;
  }

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
        isActive: true,
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
        isActive: true,
      }),
    );
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(
      service.loginPatient('ana@example.com', 'wrong-pass'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('loginPatient should fail when user is inactive', async () => {
    patientModel.findOne.mockReturnValueOnce(
      createFindOneChain({
        id: 'p1',
        email: 'ana@example.com',
        passwordHash: 'hashed-pass',
        isActive: false,
      }),
    );

    await expect(
      service.loginPatient('ana@example.com', 'StrongP@ss1'),
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
        specialty: Specialty.GENERAL_MEDICINE,
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
        specialty: Specialty.GENERAL_MEDICINE,
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
        specialty: Specialty.GENERAL_MEDICINE,
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
        specialty: Specialty.GENERAL_MEDICINE,
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
    refreshSessionModel.updateOne.mockReturnValue({
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
    refreshSessionModel.findOneAndUpdate.mockReturnValue(
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
    patientModel.findById.mockReturnValue(
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
    refreshSessionModel.updateOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    });

    await expect(
      service.revokeRefreshSession('token'),
    ).resolves.toBeUndefined();
    expect(refreshSessionModel.updateOne).toHaveBeenCalled();
  });

  it('ensureEmailIsAvailable should throw when email exists in another role', async () => {
    patientModel.findOne.mockReturnValue(createFindOneChain(null));
    doctorModel.findOne.mockReturnValue(createFindOneChain({ _id: 'd1' }));
    adminModel.findOne.mockReturnValue(createFindOneChain(null));

    await expect(
      service.ensureEmailIsAvailable('doc@example.com'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('revokeAllRefreshSessionsForUser should revoke only active sessions and accept session', async () => {
    const dbSession: { id: string } = { id: 'mongo-session' };
    refreshSessionModel.updateMany.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ modifiedCount: 2 }),
    });

    await expect(
      service.revokeAllRefreshSessionsForUser(
        'u1',
        UserRole.PATIENT,
        'password_changed',
        dbSession as never,
      ),
    ).resolves.toBeUndefined();

    const [filter, update, options] = refreshSessionModel.updateMany.mock
      .calls[0] as [
      { userId: string; role: UserRole; revokedAt: { $exists: boolean } },
      { $set: { revokedAt: Date; revokedReason: string } },
      { session: { id: string } },
    ];

    expect(filter).toEqual({
      userId: 'u1',
      role: UserRole.PATIENT,
      revokedAt: { $exists: false },
    });
    expect(update.$set.revokedReason).toBe('password_changed');
    expect(update.$set.revokedAt).toBeInstanceOf(Date);
    expect(options).toEqual({ session: dbSession });
  });

  it('revokeAllRefreshSessionsForUser should not fail when there are no active sessions', async () => {
    refreshSessionModel.updateMany.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
    });

    await expect(
      service.revokeAllRefreshSessionsForUser(
        'u1',
        UserRole.PATIENT,
        'password_changed',
      ),
    ).resolves.toBeUndefined();
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

    const result = await getInternals().buildSession(
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

    const result = await getInternals().buildSession({
      id: 'u1',
      email: 'ana@example.com',
      role: UserRole.PATIENT,
    });

    const [createPayload] = refreshSessionModel.create.mock.calls[0] as [
      RefreshSessionCreatePayload,
    ];
    expect(createPayload.expiresAt.getTime()).toBeGreaterThan(now);
    expect(result.accessToken).toBe('access-token');
    (Date.now as jest.Mock).mockRestore();
  });

  it('findAuthUserById should return null for inactive patient', async () => {
    patientModel.findById.mockReturnValue(
      createFindOneChain({
        email: 'ana@example.com',
        role: UserRole.PATIENT,
        isActive: false,
      }),
    );

    const result = await getInternals().findAuthUserById(
      'u1',
      UserRole.PATIENT,
    );

    expect(result).toBeNull();
  });

  it('findAuthUserById should resolve admin user', async () => {
    adminModel.findById.mockReturnValue(
      createFindOneChain({
        _id: 'a1',
        email: 'admin@example.com',
        role: UserRole.ADMIN,
        isActive: true,
      }),
    );

    const result = await getInternals().findAuthUserById('a1', UserRole.ADMIN);

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
        isActive: true,
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

  it('loginStaff should fail when doctor user is inactive', async () => {
    doctorModel.findOne.mockReturnValue(
      createFindOneChain({
        id: 'd1',
        email: 'doc@example.com',
        passwordHash: 'hash',
        isActive: false,
      }),
    );

    await expect(
      service.loginStaff('doc@example.com', 'StrongP@ss1'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
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
      specialty: Specialty.GENERAL_MEDICINE,
      doctorStatus: 'PENDING',
      createdAt: new Date(),
    });

    const result = await service.registerDoctor({
      firstName: 'Laura',
      lastName: 'Medina',
      email: 'doc@example.com',
      password: 'StrongP@ss1',
      specialty: Specialty.GENERAL_MEDICINE,
      personalId: 'CC123',
      phoneNumber: '3001234567',
      professionalLicense: 'P123',
    });

    expect(result.role).toBe(UserRole.DOCTOR);
  });

  it('assertPersonalIdDoesNotExist should throw on empty id', async () => {
    await expect(
      getInternals().assertPersonalIdDoesNotExist('   '),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('me should return current user payload', () => {
    const user: RequestUser = {
      userId: 'u1',
      email: 'ana@example.com',
      role: UserRole.PATIENT,
      isActive: true,
    };
    const result = service.me(user);

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

    const result = await getInternals().findAuthUserById('d1', UserRole.DOCTOR);

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

    const result = await getInternals().findAuthUserById(
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

    await getInternals().enforceActiveSessionLimit(
      'u1',
      UserRole.PATIENT,
      's1',
    );

    expect(refreshSessionModel.updateMany).not.toHaveBeenCalled();
  });

  it('authenticateAccessToken should resolve a valid local access token', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'p1',
      role: UserRole.PATIENT,
      email: 'ana@example.com',
      tokenType: 'access',
    });
    patientModel.findById.mockReturnValue(
      createFindOneChain({
        _id: { toString: () => 'p1' },
        email: 'ana@example.com',
        role: UserRole.PATIENT,
        isActive: true,
      }),
    );

    await expect(service.authenticateAccessToken('token')).resolves.toEqual({
      userId: 'p1',
      email: 'ana@example.com',
      role: UserRole.PATIENT,
      isActive: true,
    });
  });

  it('authenticateAccessToken should reject local non-access tokens', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'p1',
      role: UserRole.PATIENT,
      email: 'ana@example.com',
      tokenType: 'refresh',
    });

    await expect(
      service.authenticateAccessToken('token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('authenticateAccessToken should fall back to Auth0 when local verification fails', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('invalid local token'));
    const jwtVerify = jest.fn().mockResolvedValue({
      payload: {
        sub: 'auth0|abc',
        email: 'ana@example.com',
      },
    });
    jest.spyOn(getInternals(), 'getJoseModule').mockResolvedValue({
      jwtVerify,
      createRemoteJWKSet: jest.fn().mockReturnValue('jwks'),
    });
    configService.get.mockImplementation((key: string) => {
      if (key === 'auth.auth0Audience') {
        return 'api-audience';
      }
      if (key === 'auth.auth0Domain') {
        return 'tenant.auth0.com';
      }
      if (key === 'web.refreshMaxActiveSessions') {
        return 3;
      }
      return undefined;
    });
    patientModel.findOne
      .mockReturnValueOnce(createFindOneChain(null))
      .mockReturnValueOnce(
        createFindOneChain({
          _id: { toString: () => 'p1' },
          email: 'ana@example.com',
          role: UserRole.PATIENT,
          isActive: true,
          auth0Subject: null,
        }),
      );
    doctorModel.findOne
      .mockReturnValueOnce(createFindOneChain(null))
      .mockReturnValueOnce(createFindOneChain(null));
    adminModel.findOne
      .mockReturnValueOnce(createFindOneChain(null))
      .mockReturnValueOnce(createFindOneChain(null));
    patientModel.updateOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    });

    await expect(service.authenticateAccessToken('token')).resolves.toEqual({
      userId: 'p1',
      email: 'ana@example.com',
      role: UserRole.PATIENT,
      isActive: true,
    });
    expect(patientModel.updateOne).toHaveBeenCalledWith(
      { _id: 'p1' },
      { $set: { auth0Subject: 'auth0|abc' } },
    );
  });

  it('provisionPatientWithAuth0 should return existing linked patient', async () => {
    jest
      .spyOn(
        service as unknown as {
          verifyAuth0FromAuthorizationHeader: (header?: string) => Promise<{
            subject: string;
            email: string;
            role: UserRole | null;
            dbId: string | null;
          }>;
        },
        'verifyAuth0FromAuthorizationHeader',
      )
      .mockResolvedValue({
        subject: 'auth0|patient-1',
        email: 'ana@example.com',
        role: UserRole.PATIENT,
        dbId: 'p1',
      });
    jest
      .spyOn(
        service as unknown as {
          findRequestUserByAuth0Subject: (
            subject: string,
          ) => Promise<RequestUser | null>;
        },
        'findRequestUserByAuth0Subject',
      )
      .mockResolvedValue({
        userId: 'p1',
        email: 'ana@example.com',
        role: UserRole.PATIENT,
        isActive: true,
      });
    patientModel.findById.mockReturnValue(
      createFindOneChain({
        id: 'p1',
        firstName: 'Ana',
        lastName: 'Lopez',
        email: 'ana@example.com',
        role: UserRole.PATIENT,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      }),
    );

    const result = await service.provisionPatientWithAuth0(
      {
        firstName: 'Ana',
        lastName: 'Lopez',
      },
      'Bearer token',
    );

    expect(result.id).toBe('p1');
    expect(patientModel.create).not.toHaveBeenCalled();
  });

  it('provisionDoctorWithAuth0 should reject when personalId is missing', async () => {
    jest
      .spyOn(
        service as unknown as {
          verifyAuth0FromAuthorizationHeader: (header?: string) => Promise<{
            subject: string;
            email: string;
            role: UserRole | null;
            dbId: string | null;
          }>;
        },
        'verifyAuth0FromAuthorizationHeader',
      )
      .mockResolvedValue({
        subject: 'auth0|doctor-1',
        email: 'doc@example.com',
        role: UserRole.DOCTOR,
        dbId: null,
      });
    jest
      .spyOn(
        service as unknown as {
          findRequestUserByAuth0Subject: (
            subject: string,
          ) => Promise<RequestUser | null>;
        },
        'findRequestUserByAuth0Subject',
      )
      .mockResolvedValue(null);
    patientModel.findOne.mockReturnValue(createFindOneChain(null));
    doctorModel.findOne.mockReturnValue(createFindOneChain(null));
    adminModel.findOne.mockReturnValue(createFindOneChain(null));

    await expect(
      service.provisionDoctorWithAuth0(
        {
          firstName: 'Laura',
          lastName: 'Medina',
          specialty: Specialty.GENERAL_MEDICINE,
          phoneNumber: '3001234567',
        },
        'Bearer token',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('registerDoctor should rethrow unknown persistence errors', async () => {
    patientModel.findOne.mockReturnValue(createFindOneChain(null));
    doctorModel.findOne.mockReturnValue(createFindOneChain(null));
    adminModel.findOne.mockReturnValue(createFindOneChain(null));
    doctorModel.create.mockRejectedValue(new Error('db unavailable'));

    await expect(
      service.registerDoctor({
        firstName: 'Laura',
        lastName: 'Medina',
        email: 'doc@example.com',
        password: 'StrongP@ss1',
        specialty: Specialty.GENERAL_MEDICINE,
        personalId: 'CC-123',
        phoneNumber: '3001234567',
        professionalLicense: 'P-123',
      }),
    ).rejects.toThrow('db unavailable');
  });

  it('refreshTokens should fail when the resolved user is inactive', async () => {
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
    patientModel.findById.mockReturnValue(
      createFindOneChain({
        _id: 'u1',
        email: 'ana@example.com',
        role: UserRole.PATIENT,
        isActive: false,
      }),
    );

    await expect(service.refreshTokens('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('revokeRefreshSession should ignore tokens without jti', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'u1',
      role: UserRole.PATIENT,
      email: 'ana@example.com',
      tokenType: 'refresh',
    });

    await expect(
      service.revokeRefreshSession('token'),
    ).resolves.toBeUndefined();
    expect(refreshSessionModel.updateOne).not.toHaveBeenCalled();
  });

  it('authenticateAccessToken should reject when Auth0 user cannot be resolved', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('invalid local token'));
    jest.spyOn(getInternals(), 'getJoseModule').mockResolvedValue({
      jwtVerify: jest.fn().mockResolvedValue({
        payload: {
          sub: 'auth0|ghost',
          email: 'ghost@example.com',
        },
      }),
      createRemoteJWKSet: jest.fn().mockReturnValue('jwks'),
    });
    configService.get.mockImplementation((key: string) => {
      if (key === 'auth.auth0Audience') {
        return 'api-audience';
      }
      if (key === 'auth.auth0Domain') {
        return 'tenant.auth0.com';
      }
      if (key === 'web.refreshMaxActiveSessions') {
        return 3;
      }
      return undefined;
    });
    patientModel.findOne.mockReturnValue(createFindOneChain(null));
    doctorModel.findOne.mockReturnValue(createFindOneChain(null));
    adminModel.findOne.mockReturnValue(createFindOneChain(null));

    await expect(
      service.authenticateAccessToken('token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('provisionPatientWithAuth0 should reject when linked Auth0 role is not patient', async () => {
    jest
      .spyOn(
        service as unknown as {
          verifyAuth0FromAuthorizationHeader: (header?: string) => Promise<{
            subject: string;
            email: string;
            role: UserRole | null;
            dbId: string | null;
          }>;
        },
        'verifyAuth0FromAuthorizationHeader',
      )
      .mockResolvedValue({
        subject: 'auth0|abc',
        email: 'ana@example.com',
        role: UserRole.DOCTOR,
        dbId: null,
      });
    jest
      .spyOn(
        service as unknown as {
          findRequestUserByAuth0Subject: (
            subject: string,
          ) => Promise<RequestUser | null>;
        },
        'findRequestUserByAuth0Subject',
      )
      .mockResolvedValue({
        userId: 'd1',
        email: 'ana@example.com',
        role: UserRole.DOCTOR,
        isActive: true,
      });

    await expect(
      service.provisionPatientWithAuth0(
        { firstName: 'Ana', lastName: 'Lopez' },
        'Bearer token',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('provisionPatientWithAuth0 should reject when linked patient no longer exists', async () => {
    jest
      .spyOn(
        service as unknown as {
          verifyAuth0FromAuthorizationHeader: (header?: string) => Promise<{
            subject: string;
            email: string;
            role: UserRole | null;
            dbId: string | null;
          }>;
        },
        'verifyAuth0FromAuthorizationHeader',
      )
      .mockResolvedValue({
        subject: 'auth0|abc',
        email: 'ana@example.com',
        role: UserRole.PATIENT,
        dbId: 'p1',
      });
    jest
      .spyOn(
        service as unknown as {
          findRequestUserByAuth0Subject: (
            subject: string,
          ) => Promise<RequestUser | null>;
        },
        'findRequestUserByAuth0Subject',
      )
      .mockResolvedValue({
        userId: 'p1',
        email: 'ana@example.com',
        role: UserRole.PATIENT,
        isActive: true,
      });
    patientModel.findById.mockReturnValue(createFindOneChain(null));

    await expect(
      service.provisionPatientWithAuth0(
        { firstName: 'Ana', lastName: 'Lopez' },
        'Bearer token',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('provisionPatientWithAuth0 should create a new patient when no link exists', async () => {
    jest
      .spyOn(
        service as unknown as {
          verifyAuth0FromAuthorizationHeader: (header?: string) => Promise<{
            subject: string;
            email: string;
            role: UserRole | null;
            dbId: string | null;
          }>;
        },
        'verifyAuth0FromAuthorizationHeader',
      )
      .mockResolvedValue({
        subject: 'auth0|new-patient',
        email: 'new@example.com',
        role: null,
        dbId: null,
      });
    jest
      .spyOn(
        service as unknown as {
          findRequestUserByAuth0Subject: (
            subject: string,
          ) => Promise<RequestUser | null>;
        },
        'findRequestUserByAuth0Subject',
      )
      .mockResolvedValue(null);
    patientModel.findOne.mockReturnValue(createFindOneChain(null));
    doctorModel.findOne.mockReturnValue(createFindOneChain(null));
    adminModel.findOne.mockReturnValue(createFindOneChain(null));
    (bcrypt.hash as jest.Mock).mockResolvedValue('external-hash');
    patientModel.create.mockResolvedValue({
      id: 'p-new',
      firstName: 'Ana',
      lastName: 'Lopez',
      email: 'new@example.com',
      role: UserRole.PATIENT,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    });

    const result = await service.provisionPatientWithAuth0(
      { firstName: 'Ana', lastName: 'Lopez', birthDate: '1998-03-10' },
      'Bearer token',
    );

    expect(patientModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'new@example.com',
        auth0Subject: 'auth0|new-patient',
      }),
    );
    expect(result.id).toBe('p-new');
  });

  it('provisionDoctorWithAuth0 should reject when linked Auth0 role is not doctor', async () => {
    jest
      .spyOn(
        service as unknown as {
          verifyAuth0FromAuthorizationHeader: (header?: string) => Promise<{
            subject: string;
            email: string;
            role: UserRole | null;
            dbId: string | null;
          }>;
        },
        'verifyAuth0FromAuthorizationHeader',
      )
      .mockResolvedValue({
        subject: 'auth0|doc',
        email: 'doc@example.com',
        role: UserRole.PATIENT,
        dbId: null,
      });
    jest
      .spyOn(
        service as unknown as {
          findRequestUserByAuth0Subject: (
            subject: string,
          ) => Promise<RequestUser | null>;
        },
        'findRequestUserByAuth0Subject',
      )
      .mockResolvedValue({
        userId: 'p1',
        email: 'doc@example.com',
        role: UserRole.PATIENT,
        isActive: true,
      });

    await expect(
      service.provisionDoctorWithAuth0(
        {
          firstName: 'Laura',
          lastName: 'Medina',
          specialty: Specialty.GENERAL_MEDICINE,
          personalId: 'CC123',
          phoneNumber: '3001234567',
        },
        'Bearer token',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('provisionDoctorWithAuth0 should reject when linked doctor no longer exists', async () => {
    jest
      .spyOn(
        service as unknown as {
          verifyAuth0FromAuthorizationHeader: (header?: string) => Promise<{
            subject: string;
            email: string;
            role: UserRole | null;
            dbId: string | null;
          }>;
        },
        'verifyAuth0FromAuthorizationHeader',
      )
      .mockResolvedValue({
        subject: 'auth0|doc',
        email: 'doc@example.com',
        role: UserRole.DOCTOR,
        dbId: 'd1',
      });
    jest
      .spyOn(
        service as unknown as {
          findRequestUserByAuth0Subject: (
            subject: string,
          ) => Promise<RequestUser | null>;
        },
        'findRequestUserByAuth0Subject',
      )
      .mockResolvedValue({
        userId: 'd1',
        email: 'doc@example.com',
        role: UserRole.DOCTOR,
        isActive: true,
      });
    doctorModel.findById.mockReturnValue(createFindOneChain(null));

    await expect(
      service.provisionDoctorWithAuth0(
        {
          firstName: 'Laura',
          lastName: 'Medina',
          specialty: Specialty.GENERAL_MEDICINE,
          personalId: 'CC123',
          phoneNumber: '3001234567',
        },
        'Bearer token',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('provisionDoctorWithAuth0 should create a new doctor when no link exists', async () => {
    jest
      .spyOn(
        service as unknown as {
          verifyAuth0FromAuthorizationHeader: (header?: string) => Promise<{
            subject: string;
            email: string;
            role: UserRole | null;
            dbId: string | null;
          }>;
        },
        'verifyAuth0FromAuthorizationHeader',
      )
      .mockResolvedValue({
        subject: 'auth0|new-doc',
        email: 'doc@example.com',
        role: null,
        dbId: null,
      });
    jest
      .spyOn(
        service as unknown as {
          findRequestUserByAuth0Subject: (
            subject: string,
          ) => Promise<RequestUser | null>;
        },
        'findRequestUserByAuth0Subject',
      )
      .mockResolvedValue(null);
    patientModel.findOne.mockReturnValue(createFindOneChain(null));
    doctorModel.findOne.mockReturnValue(createFindOneChain(null));
    adminModel.findOne.mockReturnValue(createFindOneChain(null));
    (bcrypt.hash as jest.Mock).mockResolvedValue('external-hash');
    doctorModel.create.mockResolvedValue({
      id: 'd-new',
      firstName: 'Laura',
      lastName: 'Medina',
      email: 'doc@example.com',
      role: UserRole.DOCTOR,
      specialty: Specialty.GENERAL_MEDICINE,
      doctorStatus: 'PENDING',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    });

    const result = await service.provisionDoctorWithAuth0(
      {
        firstName: 'Laura',
        lastName: 'Medina',
        specialty: Specialty.GENERAL_MEDICINE,
        personalId: 'CC123',
        phoneNumber: '3001234567',
      },
      'Bearer token',
    );

    expect(doctorModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'doc@example.com',
        auth0Subject: 'auth0|new-doc',
      }),
    );
    expect(result.id).toBe('d-new');
  });

  it('findAuthUserById should return null for inactive admin', async () => {
    adminModel.findById.mockReturnValue(
      createFindOneChain({
        _id: 'a1',
        email: 'admin@example.com',
        role: UserRole.ADMIN,
        isActive: false,
      }),
    );

    const result = await getInternals().findAuthUserById('a1', UserRole.ADMIN);

    expect(result).toBeNull();
  });

  it('parseUserRole should resolve known roles and ignore invalid values', () => {
    expect(getInternals().parseUserRole('patient')).toBe(UserRole.PATIENT);
    expect(getInternals().parseUserRole('DOCTOR')).toBe(UserRole.DOCTOR);
    expect(getInternals().parseUserRole(' ADMIN ')).toBe(UserRole.ADMIN);
    expect(getInternals().parseUserRole('manager')).toBeNull();
    expect(getInternals().parseUserRole(123)).toBeNull();
  });

  it('resolveAuth0Issuer should prioritize explicit issuer and normalize trailing slash', () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'auth.auth0Issuer') {
        return 'https://issuer.example.com';
      }
      return undefined;
    });

    expect(getInternals().resolveAuth0Issuer()).toBe(
      'https://issuer.example.com/',
    );
  });

  it('resolveAuth0Issuer should derive issuer from auth0Domain and return null when absent', () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'auth.auth0Domain') {
        return 'tenant.auth0.com';
      }
      return undefined;
    });
    expect(getInternals().resolveAuth0Issuer()).toBe(
      'https://tenant.auth0.com/',
    );

    configService.get.mockReturnValue(undefined);
    expect(getInternals().resolveAuth0Issuer()).toBeNull();
  });

  it('extractBearerToken should return the trimmed bearer token and reject invalid headers', () => {
    expect(getInternals().extractBearerToken('Bearer token-123')).toBe(
      'token-123',
    );
    expect(getInternals().extractBearerToken(' bearer token-xyz ')).toBe(
      'token-xyz',
    );
    expect(() => getInternals().extractBearerToken('Basic abc')).toThrow(
      UnauthorizedException,
    );
    expect(() => getInternals().extractBearerToken('Bearer    ')).toThrow(
      UnauthorizedException,
    );
  });

  it('syncAuth0Subject should update the matching role collection', async () => {
    const updateResult = { exec: jest.fn().mockResolvedValue(undefined) };
    patientModel.updateOne.mockReturnValue(updateResult);
    doctorModel.updateOne.mockReturnValue(updateResult);
    adminModel.updateOne.mockReturnValue(updateResult);

    await getInternals().syncAuth0Subject(
      UserRole.PATIENT,
      'p1',
      'auth0|patient',
    );
    await getInternals().syncAuth0Subject(
      UserRole.DOCTOR,
      'd1',
      'auth0|doctor',
    );
    await getInternals().syncAuth0Subject(UserRole.ADMIN, 'a1', 'auth0|admin');

    expect(patientModel.updateOne).toHaveBeenCalledWith(
      { _id: 'p1' },
      { $set: { auth0Subject: 'auth0|patient' } },
    );
    expect(doctorModel.updateOne).toHaveBeenCalledWith(
      { _id: 'd1' },
      { $set: { auth0Subject: 'auth0|doctor' } },
    );
    expect(adminModel.updateOne).toHaveBeenCalledWith(
      { _id: 'a1' },
      { $set: { auth0Subject: 'auth0|admin' } },
    );
  });

  it('linkAuth0SubjectForResolvedUser should enforce active state and subject binding', async () => {
    const syncSpy = jest
      .spyOn(
        service as unknown as { syncAuth0Subject: jest.Mock },
        'syncAuth0Subject',
      )
      .mockResolvedValue(undefined);

    await expect(
      getInternals().linkAuth0SubjectForResolvedUser(
        {
          userId: 'p1',
          email: 'ana@example.com',
          role: UserRole.PATIENT,
          isActive: false,
        },
        null,
        'auth0|patient',
      ),
    ).resolves.toBeNull();

    await expect(
      getInternals().linkAuth0SubjectForResolvedUser(
        {
          userId: 'p1',
          email: 'ana@example.com',
          role: UserRole.PATIENT,
          isActive: true,
        },
        'auth0|other',
        'auth0|patient',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const user = {
      userId: 'd1',
      email: 'doc@example.com',
      role: UserRole.DOCTOR,
      isActive: true,
    };

    await expect(
      getInternals().linkAuth0SubjectForResolvedUser(
        user,
        null,
        'auth0|doctor',
      ),
    ).resolves.toEqual(user);
    expect(syncSpy).toHaveBeenCalledWith('DOCTOR', 'd1', 'auth0|doctor');

    syncSpy.mockClear();
    await expect(
      getInternals().linkAuth0SubjectForResolvedUser(
        user,
        'auth0|doctor',
        'auth0|doctor',
      ),
    ).resolves.toEqual(user);
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it('getAuth0Jwks should cache the JWKS loader per issuer', async () => {
    const createRemoteJWKSet = jest.fn().mockReturnValue({ kid: 'cached' });
    const getJoseModuleSpy = jest
      .spyOn(
        service as unknown as { getJoseModule: jest.Mock },
        'getJoseModule',
      )
      .mockResolvedValue({ createRemoteJWKSet });

    const first = await getInternals().getAuth0Jwks(
      'https://issuer.example.com/',
    );
    const second = await getInternals().getAuth0Jwks(
      'https://issuer.example.com/',
    );
    const third = await getInternals().getAuth0Jwks(
      'https://other.example.com/',
    );

    expect(first).toEqual({ kid: 'cached' });
    expect(second).toBe(first);
    expect(third).toEqual({ kid: 'cached' });
    expect(createRemoteJWKSet).toHaveBeenCalledTimes(2);
    expect(getJoseModuleSpy).toHaveBeenCalledTimes(3);
  });
});
