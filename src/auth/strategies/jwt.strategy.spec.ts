import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { Admin } from '../../admins/schemas/admin.schema';
import { Doctor } from '../../doctors/schemas/doctor.schema';
import { Patient } from '../../patients/schemas/patient.schema';
import { UserRole } from '../../common/enums/user-role.enum';
import { JwtStrategy } from './jwt.strategy';

function createFindByIdChain(result: unknown) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(result),
  };
}

describe('JwtStrategy', () => {
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
          useValue: { getOrThrow: jest.fn(() => 'secret') },
        },
        { provide: getModelToken(Patient.name), useValue: patientModel },
        { provide: getModelToken(Doctor.name), useValue: doctorModel },
        { provide: getModelToken(Admin.name), useValue: adminModel },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  it('should reject non-access tokenType', async () => {
    await expect(
      strategy.validate({
        sub: new Types.ObjectId().toString(),
        role: UserRole.PATIENT,
        email: 'ana@example.com',
        tokenType: 'refresh',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('should reject invalid subject', async () => {
    await expect(
      strategy.validate({
        sub: 'not-valid',
        role: UserRole.PATIENT,
        email: 'ana@example.com',
        tokenType: 'access',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('should validate patient payload', async () => {
    const id = new Types.ObjectId().toString();
    patientModel.findById.mockReturnValue(
      createFindByIdChain({
        email: 'ana@example.com',
        role: UserRole.PATIENT,
        isActive: true,
      }),
    );

    const result = await strategy.validate({
      sub: id,
      role: UserRole.PATIENT,
      email: 'ana@example.com',
      tokenType: 'access',
    });

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

    const result = await strategy.validate({
      sub: id,
      role: UserRole.DOCTOR,
      email: 'doc@example.com',
      tokenType: 'access',
    });

    expect(result).toEqual({
      userId: id,
      email: 'doc@example.com',
      role: UserRole.DOCTOR,
      isActive: true,
    });
  });

  it('should reject inactive user', async () => {
    const id = new Types.ObjectId().toString();
    adminModel.findById.mockReturnValue(
      createFindByIdChain({
        email: 'admin@example.com',
        role: UserRole.ADMIN,
        isActive: false,
      }),
    );

    await expect(
      strategy.validate({
        sub: id,
        role: UserRole.ADMIN,
        email: 'admin@example.com',
        tokenType: 'access',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
