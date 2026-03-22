import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { DoctorStatus } from '../common/enums/doctor-status.enum';
import { Specialty } from '../common/enums/specialty.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { RequestUser } from '../common/interfaces/request-user.interface';
import { Doctor } from '../doctors/schemas/doctor.schema';
import { RethusVerification } from '../doctors/schemas/rethus-verification.schema';
import { AdminService } from './admin.service';
import { ListDoctorsForReviewDto } from './dto/list-doctors-for-review.dto';
import { RethusVerifyDto } from './dto/rethus-verify.dto';
import { OutboxDispatcherService } from '../outbox/outbox-dispatcher.service';
import { OutboxService } from '../outbox/outbox.service';

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
    find: jest.fn(),
    countDocuments: jest.fn(),
  };

  const rethusVerificationModelMock = {
    create: jest.fn(),
  };

  const outboxServiceMock = {
    createDoctorVerificationChangedEvent: jest.fn(),
  };

  const outboxDispatcherServiceMock = {
    dispatchPendingEvents: jest.fn(),
  };

  const dto: RethusVerifyDto = {
    programType: 'UNIVERSITY' as RethusVerifyDto['programType'],
    titleObtainingOrigin: 'LOCAL' as RethusVerifyDto['titleObtainingOrigin'],
    professionOccupation: 'MEDICO GENERAL',
    startDate: '2024-01-15',
    rethusState: 'VALID' as RethusVerifyDto['rethusState'],
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
          provide: OutboxService,
          useValue: outboxServiceMock,
        },
        {
          provide: OutboxDispatcherService,
          useValue: outboxDispatcherServiceMock,
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('should verify doctor and persist verification + outbox event', async () => {
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
      outboxServiceMock.createDoctorVerificationChangedEvent,
    ).toHaveBeenCalledWith(
      {
        doctorId: validDoctorId,
        doctorStatus: 'VERIFIED',
        notes: 'ok',
      },
      undefined,
      sessionMock,
    );
    expect(
      outboxDispatcherServiceMock.dispatchPendingEvents,
    ).toHaveBeenCalled();
    expect(sessionMock.endSession).toHaveBeenCalled();
  });

  it('should throw BadRequestException when doctorId is invalid', async () => {
    await expect(
      service.verifyDoctor('invalid-id', dto, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should throw NotFoundException when doctor does not exist', async () => {
    doctorModelMock.findById.mockReturnValue({
      session: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(null),
    });

    await expect(
      service.verifyDoctor(validDoctorId, dto, actor),
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

  it('should verify doctor with expired rethus state', async () => {
    const doctorDocument = {
      id: validDoctorId,
      doctorStatus: 'PENDING',
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
        rethusState: 'EXPIRED',
        administrativeAct: 'ACT-2026-001',
        reportingEntity: 'MINISTERIO DE SALUD',
      },
    ]);

    const result = await service.verifyDoctor(
      validDoctorId,
      { ...dto, rethusState: 'EXPIRED' as RethusVerifyDto['rethusState'] },
      actor,
    );

    expect(result.doctorStatus).toBe(DoctorStatus.REJECTED);
    expect(
      outboxServiceMock.createDoctorVerificationChangedEvent,
    ).toHaveBeenCalledWith(
      {
        doctorId: validDoctorId,
        doctorStatus: DoctorStatus.REJECTED,
        notes: 'ok',
      },
      undefined,
      sessionMock,
    );
  });

  it('should verify doctor with pending rethus state', async () => {
    const doctorDocument = {
      id: validDoctorId,
      doctorStatus: 'PENDING',
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
        rethusState: 'PENDING',
        administrativeAct: 'ACT-2026-001',
        reportingEntity: 'MINISTERIO DE SALUD',
      },
    ]);

    const result = await service.verifyDoctor(
      validDoctorId,
      { ...dto, rethusState: 'PENDING' as RethusVerifyDto['rethusState'] },
      actor,
    );

    expect(result.doctorStatus).toBe(DoctorStatus.PENDING);
    expect(
      outboxServiceMock.createDoctorVerificationChangedEvent,
    ).toHaveBeenCalledWith(
      {
        doctorId: validDoctorId,
        doctorStatus: DoctorStatus.PENDING,
        notes: 'ok',
      },
      undefined,
      sessionMock,
    );
  });

  describe('listDoctorsForReview', () => {
    const setupFindMock = () => {
      const rethusAggMock = { exec: jest.fn().mockResolvedValue([]) };
      rethusVerificationModelMock.aggregate = jest
        .fn()
        .mockReturnValue(rethusAggMock);
      const doctorAggMock = { exec: jest.fn().mockResolvedValue([]) };
      doctorModelMock.aggregate = jest.fn().mockReturnValue(doctorAggMock);
      doctorModelMock.countDocuments.mockResolvedValue(0);
    };

    it('should escape special regex characters in search to prevent ReDoS', async () => {
      setupFindMock();

      const doctors: unknown[] = [];
      doctorModelMock.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(doctors),
      });

      const query: ListDoctorsForReviewDto = { search: '.*+?^${}()|[]\\' };
      await service.listDoctorsForReview(query);

      const [findCallArg] = doctorModelMock.find.mock.calls[0] as [unknown];
      const findCall = findCallArg as {
        $or?: Array<{ firstName: RegExp }>;
      };
      expect(findCall.$or).toBeDefined();
      const usedRegex = findCall.$or![0].firstName;
      // All special characters must be escaped – the source should not contain unescaped metacharacters
      expect(usedRegex.source).toBe(
        '\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\',
      );
    });

    it('should apply no $or filter when search is absent', async () => {
      setupFindMock();

      const doctors: unknown[] = [];
      doctorModelMock.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(doctors),
      });

      const query: ListDoctorsForReviewDto = {};
      await service.listDoctorsForReview(query);

      const [findCallArg] = doctorModelMock.find.mock.calls[0] as [unknown];
      const findCall = findCallArg as {
        $or?: unknown;
      };
      expect(findCall.$or).toBeUndefined();
    });

    it('should skip verification aggregate when no doctors', async () => {
      setupFindMock();
      rethusVerificationModelMock.aggregate = jest.fn();

      doctorModelMock.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });

      await service.listDoctorsForReview({ search: '   ' });

      expect(rethusVerificationModelMock.aggregate).not.toHaveBeenCalled();
    });

    it('should apply filters and map latest verification + status summary', async () => {
      const doctorAId = new Types.ObjectId();
      const doctorBId = new Types.ObjectId();
      const doctors = [
        {
          _id: doctorAId,
          firstName: 'Ana',
          lastName: 'Lopez',
          email: 'ana@example.com',
          specialty: Specialty.GENERAL_MEDICINE,
          doctorStatus: DoctorStatus.VERIFIED,
          professionalLicense: 'P-123',
          personalId: 'CC-1',
          phoneNumber: '3001234567',
          createdAt: new Date('2026-03-01T00:00:00.000Z'),
          updatedAt: new Date('2026-03-02T00:00:00.000Z'),
        },
        {
          _id: doctorBId,
          firstName: 'Luis',
          lastName: 'Perez',
          email: 'luis@example.com',
          specialty: Specialty.GENERAL_MEDICINE,
          doctorStatus: DoctorStatus.PENDING,
          professionalLicense: 'P-456',
          personalId: 'CC-2',
          phoneNumber: '3009876543',
          createdAt: new Date('2026-03-03T00:00:00.000Z'),
          updatedAt: new Date('2026-03-04T00:00:00.000Z'),
        },
      ];

      doctorModelMock.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(doctors),
      });

      rethusVerificationModelMock.aggregate = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          {
            doctorId: doctorAId,
            checkedAt: new Date('2026-03-05T00:00:00.000Z'),
            checkedBy: 'admin@example.com',
            rethusState: 'VALID',
            reportingEntity: 'MINISTERIO DE SALUD',
            notes: 'ok',
          },
        ]),
      });

      doctorModelMock.countDocuments.mockResolvedValue(2);
      doctorModelMock.aggregate = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          { _id: DoctorStatus.PENDING, count: 1 },
          { _id: DoctorStatus.VERIFIED, count: 1 },
          { _id: DoctorStatus.REJECTED, count: 0 },
        ]),
      });

      const result = await service.listDoctorsForReview({
        search: 'ana',
        status: DoctorStatus.VERIFIED,
        specialty: Specialty.GENERAL_MEDICINE,
        page: 2,
        limit: 1,
      });

      const [filterArg] = doctorModelMock.find.mock.calls[0] as [unknown];
      const filter = filterArg as {
        doctorStatus?: DoctorStatus;
        specialty?: Specialty;
        $or?: Array<Record<string, unknown>>;
      };

      expect(filter.doctorStatus).toBe(DoctorStatus.VERIFIED);
      expect(filter.specialty).toBe(Specialty.GENERAL_MEDICINE);
      expect(filter.$or).toBeDefined();
      expect(result.summary).toEqual({
        total: 2,
        pending: 1,
        verified: 1,
        rejected: 0,
      });
      expect(result.pagination).toEqual({
        page: 2,
        limit: 1,
        total: 2,
        totalPages: 2,
      });
      expect(result.items[0].latestVerification).toBeDefined();
      expect(result.items[1].latestVerification).toBeNull();
    });
  });
});
