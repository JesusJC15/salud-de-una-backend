import { ConflictException, UnauthorizedException } from '@nestjs/common';
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
};

type RefreshSessionMockModel = BaseMockModel & {
  find: jest.Mock;
  updateMany: jest.Mock;
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
  let jwtService: { signAsync: jest.Mock; decode: jest.Mock };
  let configService: { getOrThrow: jest.Mock; get: jest.Mock };

  beforeEach(async () => {
    patientModel = {
      create: jest.fn(),
      findOne: jest.fn(),
    };

    doctorModel = {
      create: jest.fn(),
      findOne: jest.fn(),
    };

    adminModel = {
      create: jest.fn(),
      findOne: jest.fn(),
    };

    refreshSessionModel = {
      create: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      updateMany: jest.fn(),
    };

    jwtService = {
      signAsync: jest
        .fn()
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token'),
      decode: jest
        .fn()
        .mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 }),
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
});
