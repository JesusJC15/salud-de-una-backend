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

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

type MockModel = {
  create: jest.Mock;
  findOne: jest.Mock;
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
  let patientModel: MockModel;
  let doctorModel: MockModel;
  let adminModel: MockModel;
  let jwtService: { signAsync: jest.Mock };

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

    jwtService = {
      signAsync: jest
        .fn()
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token'),
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
          provide: JwtService,
          useValue: jwtService,
        },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) => {
              if (key === 'auth.jwtSecret')
                return 'test-secret-12345678901234567890123456789012';
              if (key === 'auth.accessTokenExpiresIn') return '1h';
              if (key === 'auth.refreshTokenExpiresIn') return '7d';
              return undefined;
            }),
          },
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
      gender: 'F',
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
        gender: 'F',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('login should return access/refresh tokens and user info', async () => {
    patientModel.findOne.mockReturnValueOnce(
      createFindOneChain({
        id: 'p1',
        email: 'ana@example.com',
        passwordHash: 'hashed-pass',
      }),
    );

    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const result = await service.login('ana@example.com', 'StrongP@ss1');

    expect(result).toEqual({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      user: {
        id: 'p1',
        email: 'ana@example.com',
        role: UserRole.PATIENT,
      },
    });
  });

  it('login should fail with invalid credentials when user is not found', async () => {
    patientModel.findOne.mockReturnValue(createFindOneChain(null));
    doctorModel.findOne.mockReturnValue(createFindOneChain(null));
    adminModel.findOne.mockReturnValue(createFindOneChain(null));

    await expect(
      service.login('missing@example.com', 'whatever'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('login should fail with invalid credentials when password does not match', async () => {
    patientModel.findOne.mockReturnValueOnce(
      createFindOneChain({
        id: 'p1',
        email: 'ana@example.com',
        passwordHash: 'hashed-pass',
      }),
    );
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(
      service.login('ana@example.com', 'wrong-pass'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
