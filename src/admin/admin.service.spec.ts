import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '../common/enums/user-role.enum';
import { RequestUser } from '../common/interfaces/request-user.interface';
import { Doctor } from '../doctors/schemas/doctor.schema';
import { RethusVerification } from '../doctors/schemas/rethus-verification.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { AdminService } from './admin.service';
import { RethusVerifyDto } from './dto/rethus-verify.dto';

describe('AdminService', () => {
  let service: AdminService;
  const validDoctorId = '507f1f77bcf86cd799439011';

  const sessionMock = {
    withTransaction: jest.fn(),
    endSession: jest.fn(),
  };

  const connectionMock = {
    startSession: jest.fn(),
  };

  const doctorModelMock = {
    findById: jest.fn(),
  };

  const rethusVerificationModelMock = {
    create: jest.fn(),
  };

  const notificationsServiceMock = {
    createDoctorStatusChange: jest.fn(),
  };

  const dto: RethusVerifyDto = {
    status: 'VERIFIED',
    programType: 'UNIVERSITY',
    titleObtainingOrigin: 'LOCAL',
    professionOccupation: 'MEDICO GENERAL',
    startDate: '2024-01-15',
    rethusState: 'VALID',
    administrativeAct: 'ACT-2026-001',
    reportingEntity: 'MINISTERIO DE SALUD',
    notes: 'ok',
  };

  const actor: RequestUser = {
    userId: 'admin-id',
    email: 'admin@example.com',
    role: UserRole.ADMIN,
    isActive: true,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    connectionMock.startSession.mockResolvedValue(sessionMock);
    sessionMock.withTransaction.mockImplementation(
      async (cb: () => Promise<void>) => cb(),
    );
    sessionMock.endSession.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: getConnectionToken(),
          useValue: connectionMock,
        },
        {
          provide: getModelToken(Doctor.name),
          useValue: doctorModelMock,
        },
        {
          provide: getModelToken(RethusVerification.name),
          useValue: rethusVerificationModelMock,
        },
        {
          provide: NotificationsService,
          useValue: notificationsServiceMock,
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('should verify doctor and persist verification + notification', async () => {
    const doctorDocument = {
      id: validDoctorId,
      doctorStatus: 'VERIFIED',
      rethusVerification: undefined,
      save: jest.fn().mockResolvedValue(undefined),
    };

    doctorModelMock.findById.mockReturnValue({
      session: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(doctorDocument),
    });

    rethusVerificationModelMock.create.mockResolvedValue([
      {
        _id: 'verification-id',
        programType: 'UNIVERSITY',
        titleObtainingOrigin: 'LOCAL',
        professionOccupation: 'MEDICO GENERAL',
        startDate: new Date('2024-01-15'),
        rethusState: 'VALID',
        administrativeAct: 'ACT-2026-001',
        reportingEntity: 'MINISTERIO DE SALUD',
      },
    ]);

    const result = await service.verifyDoctor(validDoctorId, dto, actor);

    expect(result).toMatchObject({
      doctorId: validDoctorId,
      doctorStatus: 'VERIFIED',
      verification: {
        programType: 'UNIVERSITY',
        titleObtainingOrigin: 'LOCAL',
      },
    });
    expect(doctorDocument.save).toHaveBeenCalled();
    expect(
      notificationsServiceMock.createDoctorStatusChange,
    ).toHaveBeenCalledWith(validDoctorId, 'VERIFIED', 'ok');
    expect(sessionMock.endSession).toHaveBeenCalled();
  });

  it('should throw NotFoundException when doctor does not exist', async () => {
    doctorModelMock.findById.mockReturnValue({
      session: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(null),
    });

    await expect(
      service.verifyDoctor('missing-id', dto, actor),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(sessionMock.endSession).toHaveBeenCalled();
  });

  it('should map unexpected errors to InternalServerErrorException', async () => {
    const doctorDocument = {
      id: validDoctorId,
      doctorStatus: 'PENDING',
      save: jest.fn().mockResolvedValue(undefined),
    };

    doctorModelMock.findById.mockReturnValue({
      session: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(doctorDocument),
    });

    rethusVerificationModelMock.create.mockRejectedValue(
      new Error('db failure'),
    );

    await expect(
      service.verifyDoctor(validDoctorId, dto, actor),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(sessionMock.endSession).toHaveBeenCalled();
  });
});
