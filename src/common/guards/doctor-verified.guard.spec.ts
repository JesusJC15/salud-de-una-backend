import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { UserRole } from '../enums/user-role.enum';
import { DoctorStatus } from '../enums/doctor-status.enum';
import { Doctor } from '../../doctors/schemas/doctor.schema';
import { DoctorVerifiedGuard } from './doctor-verified.guard';

describe('DoctorVerifiedGuard', () => {
  let guard: DoctorVerifiedGuard;

  const doctorModelMock = {
    findById: jest.fn(),
  };

  function createExecutionContext(user: { userId: string; role: UserRole }) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as ExecutionContext;
  }

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DoctorVerifiedGuard,
        {
          provide: getModelToken(Doctor.name),
          useValue: doctorModelMock,
        },
      ],
    }).compile();

    guard = module.get<DoctorVerifiedGuard>(DoctorVerifiedGuard);
  });

  it('should reject non-doctor users without DB lookup', async () => {
    const context = createExecutionContext({
      userId: 'u1',
      role: UserRole.ADMIN,
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(doctorModelMock.findById).not.toHaveBeenCalled();
  });

  it('should allow doctor with VERIFIED doctorStatus', async () => {
    doctorModelMock.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest
        .fn()
        .mockResolvedValue({ doctorStatus: DoctorStatus.VERIFIED }),
    });

    const context = createExecutionContext({
      userId: 'doctor-id',
      role: UserRole.DOCTOR,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('should reject doctor with non-VERIFIED doctorStatus', async () => {
    doctorModelMock.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue({ doctorStatus: DoctorStatus.PENDING }),
    });

    const context = createExecutionContext({
      userId: 'doctor-id',
      role: UserRole.DOCTOR,
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('should reject when doctor record does not exist', async () => {
    doctorModelMock.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(null),
    });

    const context = createExecutionContext({
      userId: 'doctor-id',
      role: UserRole.DOCTOR,
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
