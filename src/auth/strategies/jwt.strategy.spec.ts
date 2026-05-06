import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { Admin } from '../../admins/schemas/admin.schema';
import { Doctor } from '../../doctors/schemas/doctor.schema';
import { Patient } from '../../patients/schemas/patient.schema';
import { UserRole } from '../../common/enums/user-role.enum';
import { AUTH0_CLAIM_NS, JwtStrategy } from './jwt.strategy';

function createFindByIdChain(result: unknown) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(result),
  };
}

function buildPayload(
  dbId: string,
  role: UserRole,
  isActive = true,
  extraClaims: Record<string, unknown> = {},
) {
  return {
    sub: 'auth0|507f1f77bcf86cd799439011',
    iss: 'https://test.auth0.com/',
    aud: ['https://api.salud-de-una.com'],
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    [`${AUTH0_CLAIM_NS}db_id`]: dbId,
    [`${AUTH0_CLAIM_NS}role`]: role,
    [`${AUTH0_CLAIM_NS}is_active`]: isActive,
    ...extraClaims,
  };
}

describe('JwtStrategy (Auth0)', () => {
  let strategy: JwtStrategy;
  const patientModel = { findById: jest.fn() };
  const doctorModel = { findById: jest.fn() };
  const adminModel = { findById: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'auth.auth0Domain') return 'test.auth0.com';
              if (key === 'auth.auth0Audience')
                return 'https://api.salud-de-una.com';
              return undefined;
            }),
            getOrThrow: jest.fn((key: string) => {
              if (key === 'auth.auth0Domain') return 'test.auth0.com';
              if (key === 'auth.auth0Audience')
                return 'https://api.salud-de-una.com';
              throw new Error(`Config key not found: ${key}`);
            }),
          },
        },
        { provide: getModelToken(Patient.name), useValue: patientModel },
        { provide: getModelToken(Doctor.name), useValue: doctorModel },
        { provide: getModelToken(Admin.name), useValue: adminModel },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  it('should reject token without db_id claim (unprovisioned user)', async () => {
    await expect(
      strategy.validate({
        sub: 'auth0|unprovisioned',
        iss: 'https://test.auth0.com/',
        aud: 'https://api.salud-de-una.com',
        exp: 9999999999,
        iat: 0,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('should reject token without role claim', async () => {
    const id = new Types.ObjectId().toString();
    await expect(
      strategy.validate({
        sub: 'auth0|xxx',
        iss: 'https://test.auth0.com/',
        aud: 'https://api.salud-de-una.com',
        exp: 9999999999,
        iat: 0,
        [`${AUTH0_CLAIM_NS}db_id`]: id,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('should reject token with is_active=false claim', async () => {
    const id = new Types.ObjectId().toString();
    await expect(
      strategy.validate(buildPayload(id, UserRole.PATIENT, false)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('should validate patient payload and return RequestUser', async () => {
    const id = new Types.ObjectId().toString();
    patientModel.findById.mockReturnValue(
      createFindByIdChain({
        email: 'ana@example.com',
        role: UserRole.PATIENT,
        isActive: true,
      }),
    );

    const result = await strategy.validate(buildPayload(id, UserRole.PATIENT));

    expect(result).toEqual({
      userId: id,
      email: 'ana@example.com',
      role: UserRole.PATIENT,
      isActive: true,
    });
  });

  it('should validate doctor payload', async () => {
    const id = new Types.ObjectId().toString();
    doctorModel.findById.mockReturnValue(
      createFindByIdChain({
        email: 'doc@example.com',
        role: UserRole.DOCTOR,
        isActive: true,
      }),
    );

    const result = await strategy.validate(buildPayload(id, UserRole.DOCTOR));

    expect(result).toEqual({
      userId: id,
      email: 'doc@example.com',
      role: UserRole.DOCTOR,
      isActive: true,
    });
  });

  it('should validate admin payload', async () => {
    const id = new Types.ObjectId().toString();
    adminModel.findById.mockReturnValue(
      createFindByIdChain({
        email: 'admin@example.com',
        role: UserRole.ADMIN,
        isActive: true,
      }),
    );

    const result = await strategy.validate(buildPayload(id, UserRole.ADMIN));

    expect(result).toEqual({
      userId: id,
      email: 'admin@example.com',
      role: UserRole.ADMIN,
      isActive: true,
    });
  });

  it('should reject inactive user from DB', async () => {
    const id = new Types.ObjectId().toString();
    adminModel.findById.mockReturnValue(
      createFindByIdChain({
        email: 'admin@example.com',
        role: UserRole.ADMIN,
        isActive: false,
      }),
    );

    await expect(
      strategy.validate(buildPayload(id, UserRole.ADMIN)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
