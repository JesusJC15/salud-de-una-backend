import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { Admin } from '../admins/schemas/admin.schema';
import { RefreshSession } from '../auth/schemas/refresh-session.schema';
import { DoctorStatus } from '../common/enums/doctor-status.enum';
import { RethusState } from '../common/enums/rethus-state.enum';
import { Specialty } from '../common/enums/specialty.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { RequestUser } from '../common/interfaces/request-user.interface';
import { Doctor } from '../doctors/schemas/doctor.schema';
import { RethusVerification } from '../doctors/schemas/rethus-verification.schema';
import { OutboxDispatcherService } from '../outbox/outbox-dispatcher.service';
import { OutboxService } from '../outbox/outbox.service';
import { Patient } from '../patients/schemas/patient.schema';
import { AdminService } from './admin.service';
import { ListDoctorsForReviewDto } from './dto/list-doctors-for-review.dto';
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
    find: jest.fn(),
    countDocuments: jest.fn(),
    aggregate: jest.fn(),
  };

  const rethusVerificationModelMock = {
    create: jest.fn(),
    findOne: jest.fn(),
    aggregate: jest.fn(),
  };

  const patientModelMock = {
    find: jest.fn(),
    countDocuments: jest.fn(),
    findById: jest.fn(),
  };

  const adminModelMock = {
    find: jest.fn(),
    countDocuments: jest.fn(),
    findById: jest.fn(),
  };

  const refreshSessionModelMock = {
    updateMany: jest.fn(),
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
          provide: getModelToken(Patient.name),
          useValue: patientModelMock,
        },
        {
          provide: getModelToken(Admin.name),
          useValue: adminModelMock,
        },
        {
          provide: getModelToken(RefreshSession.name),
          useValue: refreshSessionModelMock,
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
      _id: new Types.ObjectId(validDoctorId),
      doctorStatus: 'VERIFIED',
      rethusVerification: undefined,
      save: jest.fn().mockResolvedValue(undefined),
    };

    doctorModelMock.findById.mockReturnValue({
      session: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(doctorDocument),
    });
    rethusVerificationModelMock.findOne.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      session: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(null),
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

  it('should map compact decision dto to verification state', async () => {
  const doctorDocument = {
    id: validDoctorId,
    _id: new Types.ObjectId(validDoctorId),
    doctorStatus: 'PENDING',
    save: jest.fn().mockResolvedValue(undefined),
  };
  doctorModelMock.findById.mockReturnValue({
    session: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(doctorDocument),
  });
  rethusVerificationModelMock.findOne.mockReturnValue({
    sort: jest.fn().mockReturnThis(),
    session: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(null),
  });
  rethusVerificationModelMock.create.mockResolvedValue([
    {
      _id: 'verification-id',
      programType: 'UNDEFINED',
      titleObtainingOrigin: 'LOCAL',
      professionOccupation: 'PENDIENTE DE ACTUALIZACION',
      startDate: new Date('1970-01-01'),
      rethusState: 'EXPIRED',
      administrativeAct: 'N/A',
      reportingEntity: 'N/A',
    },
  ]);

  const result = await service.verifyDoctor(
    validDoctorId,
    { action: 'REJECT', notes: 'faltan soportes' },
    actor,
  );

  expect(result.doctorStatus).toBe(DoctorStatus.REJECTED);
  expect(rethusVerificationModelMock.create).toHaveBeenCalledWith(
    [
      expect.objectContaining({
        rethusState: 'EXPIRED',
        notes: 'faltan soportes',
      }),
    ],
    { session: sessionMock },
  );
});

it('should reuse latest verification data when approving compact decision dto', async () => {
  const doctorDocument = {
    id: validDoctorId,
    _id: new Types.ObjectId(validDoctorId),
    doctorStatus: 'PENDING',
    save: jest.fn().mockResolvedValue(undefined),
  };
  doctorModelMock.findById.mockReturnValue({
    session: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(doctorDocument),
  });
  rethusVerificationModelMock.findOne.mockReturnValue({
    sort: jest.fn().mockReturnThis(),
    session: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue({
      programType: 'TECHNICAL',
      titleObtainingOrigin: 'FOREIGN',
      professionOccupation: 'ODONTOLOGO',
      startDate: new Date('2020-04-01'),
      administrativeAct: 'ACT-OLD',
      reportingEntity: 'SECRETARIA',
    }),
  });
  rethusVerificationModelMock.create.mockResolvedValue([
    {
      _id: 'verification-id',
      programType: 'TECHNICAL',
      titleObtainingOrigin: 'FOREIGN',
      professionOccupation: 'ODONTOLOGO',
      startDate: new Date('2020-04-01'),
      rethusState: 'VALID',
      administrativeAct: 'ACT-OLD',
      reportingEntity: 'SECRETARIA',
    },
  ]);

  const result = await service.verifyDoctor(
    validDoctorId,
    { action: 'APPROVE', notes: 'aprobado' },
    actor,
  );

  expect(result.doctorStatus).toBe(DoctorStatus.VERIFIED);
  expect(rethusVerificationModelMock.create).toHaveBeenCalledWith(
    [
      expect.objectContaining({
        programType: 'TECHNICAL',
        titleObtainingOrigin: 'FOREIGN',
        rethusState: 'VALID',
      }),
    ],
    { session: sessionMock },
  );
});

it('should map pending rethus state to pending doctor status', async () => {
  const doctorDocument = {
    id: validDoctorId,
    _id: new Types.ObjectId(validDoctorId),
    doctorStatus: 'PENDING',
    save: jest.fn().mockResolvedValue(undefined),
  };

  doctorModelMock.findById.mockReturnValue({
    session: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(doctorDocument),
  });
  rethusVerificationModelMock.findOne.mockReturnValue({
    sort: jest.fn().mockReturnThis(),
    session: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(null),
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
    {
      ...dto,
      rethusState: RethusState.PENDING,
    },
    actor,
  );

  expect(result.doctorStatus).toBe(DoctorStatus.PENDING);
});

it('should fail with internal error when transaction callback produces no response', async () => {
  sessionMock.withTransaction.mockImplementation(async () => undefined);

  await expect(
    service.verifyDoctor(validDoctorId, dto, actor),
  ).rejects.toBeInstanceOf(InternalServerErrorException);

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
    _id: new Types.ObjectId(validDoctorId),
    doctorStatus: 'PENDING',
    save: jest.fn().mockResolvedValue(undefined),
  };

  doctorModelMock.findById.mockReturnValue({
    session: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(doctorDocument),
  });
  rethusVerificationModelMock.findOne.mockReturnValue({
    sort: jest.fn().mockReturnThis(),
    session: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(null),
  });
  rethusVerificationModelMock.create.mockRejectedValue(
    new Error('db failure'),
  );

  await expect(
    service.verifyDoctor(validDoctorId, dto, actor),
  ).rejects.toBeInstanceOf(InternalServerErrorException);
  expect(sessionMock.endSession).toHaveBeenCalled();
});
  
  describe('listDoctorsForReview', () => {
    const setupFindMock = () => {
      rethusVerificationModelMock.aggregate.mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      });
      doctorModelMock.aggregate.mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      });
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
      expect(usedRegex.source).toBe(
        '\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\',
      );
    });

    it('should apply no $or filter when search is absent', async () => {
  setupFindMock();

      doctorModelMock.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });

      await service.listDoctorsForReview({});

      const [findCallArg] = doctorModelMock.find.mock.calls[0] as [unknown];
      const findCall = findCallArg as { $or?: unknown };
      expect(findCall.$or).toBeUndefined();
    });

    it('should skip verification aggregation when no doctors are returned', async () => {
      setupFindMock();

      doctorModelMock.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });

      await service.listDoctorsForReview({ page: 1, limit: 5 });

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

      rethusVerificationModelMock.aggregate.mockReturnValue({
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
      doctorModelMock.aggregate.mockReturnValue({
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

  it('listUsers should paginate across roles when role filter is absent', async () => {
    patientModelMock.find.mockReturnValue({
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([
        {
          _id: new Types.ObjectId(),
          firstName: 'Ana',
          lastName: 'Patient',
          email: 'ana@patient.com',
          isActive: true,
          createdAt: new Date('2026-03-02'),
        },
      ]),
    });
    doctorModelMock.find.mockReturnValue({
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([
        {
          _id: new Types.ObjectId(),
          firstName: 'Doc',
          lastName: 'One',
          email: 'doc@hospital.com',
          isActive: true,
          specialty: 'GENERAL_MEDICINE',
          doctorStatus: 'PENDING',
          createdAt: new Date('2026-03-03'),
        },
      ]),
    });
    adminModelMock.find.mockReturnValue({
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    });

    const result = (await service.listUsers({ page: 1, limit: 10 })) as {
      pagination: { total: number };
      items: Array<{ role: UserRole }>;
    };

    expect(result.pagination.total).toBe(2);
    expect(result.items[0].role).toBe(UserRole.DOCTOR);
  });

  it('listUsers should query patient collection when role is patient', async () => {
    patientModelMock.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([
        {
          _id: new Types.ObjectId(),
          firstName: 'Pat',
          lastName: 'One',
          email: 'pat@patient.com',
          isActive: true,
        },
      ]),
    });
    patientModelMock.countDocuments.mockResolvedValue(1);

    const result = await service.listUsers({
      role: UserRole.PATIENT,
      search: 'pat',
      page: 1,
      limit: 10,
    });

    expect(patientModelMock.find).toHaveBeenCalled();
    expect(result.items[0].role).toBe(UserRole.PATIENT);
  });

  it('listUsers should query admin collection and escape search when role is admin', async () => {
    adminModelMock.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([
        {
          _id: new Types.ObjectId(),
          firstName: 'Root',
          lastName: 'Admin',
          email: 'root@admin.com',
          isActive: true,
        },
      ]),
    });
    adminModelMock.countDocuments.mockResolvedValue(1);

    const result = await service.listUsers({
      role: UserRole.ADMIN,
      search: '.*admin',
      page: 1,
      limit: 10,
    });

    const [searchFilter] = adminModelMock.find.mock.calls[0] as [
      Record<string, unknown>,
    ];
    const orItems = searchFilter.$or as Array<{ email?: RegExp }>;
    expect(orItems).toBeDefined();
    expect(orItems[2].email?.source).toBe('\\.\\*admin');
    expect(result.items[0].role).toBe(UserRole.ADMIN);
  });
  
  it('updateUserActive should revoke sessions when disabling user', async () => {
    const doctorId = new Types.ObjectId().toString();
    const saveMock = jest.fn().mockResolvedValue(undefined);
    doctorModelMock.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        id: doctorId,
        isActive: true,
        updatedAt: new Date('2026-03-20'),
        save: saveMock,
      }),
    });
    refreshSessionModelMock.updateMany.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    });

    const result = await service.updateUserActive(UserRole.DOCTOR, doctorId, {
      isActive: false,
    });

    expect(saveMock).toHaveBeenCalled();
    expect(refreshSessionModelMock.updateMany).toHaveBeenCalled();
    expect(result).toMatchObject({ id: doctorId, isActive: false });
  });
  
  
  it('updateUserActive should revoke sessions when disabling user', async () => {
  const doctorId = new Types.ObjectId().toString();
  const saveMock = jest.fn().mockResolvedValue(undefined);
  doctorModelMock.findById.mockReturnValue({
    exec: jest.fn().mockResolvedValue({
      id: doctorId,
      isActive: true,
      updatedAt: new Date('2026-03-20'),
      save: saveMock,
    }),
  });
  refreshSessionModelMock.updateMany.mockReturnValue({
    exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  });

  const result = await service.updateUserActive(UserRole.DOCTOR, doctorId, {
    isActive: false,
  });

  expect(saveMock).toHaveBeenCalled();
  expect(refreshSessionModelMock.updateMany).toHaveBeenCalled();
  expect(result).toMatchObject({ id: doctorId, isActive: false });
});

it('updateUserActive should not revoke sessions when enabling user', async () => {
  const patientId = new Types.ObjectId().toString();
  const saveMock = jest.fn().mockResolvedValue(undefined);
  patientModelMock.findById.mockReturnValue({
    exec: jest.fn().mockResolvedValue({
      id: patientId,
      isActive: false,
      save: saveMock,
    }),
  });

  const result = await service.updateUserActive(UserRole.PATIENT, patientId, {
    isActive: true,
  });

  expect(saveMock).toHaveBeenCalled();
  expect(refreshSessionModelMock.updateMany).not.toHaveBeenCalled();
  expect(result).toMatchObject({ id: patientId, isActive: true });
});

it('updateUserActive should throw when user id is invalid', async () => {
  await expect(
    service.updateUserActive(UserRole.PATIENT, 'invalid-id', {
      isActive: false,
    }),
  ).rejects.toBeInstanceOf(BadRequestException);
});

it('updateUserActive should throw when user does not exist', async () => {
  adminModelMock.findById.mockReturnValue({
    exec: jest.fn().mockResolvedValue(null),
  });

  await expect(
    service.updateUserActive(UserRole.ADMIN, new Types.ObjectId().toString(), {
      isActive: false,
    }),
  ).rejects.toBeInstanceOf(NotFoundException);
});

it('getUserByRole should throw on invalid user id', async () => {
  await expect(
    service.getUserByRole(UserRole.ADMIN, 'invalid-id'),
  ).rejects.toBeInstanceOf(BadRequestException);
});

it('getUserByRole should map patient payload', async () => {
  const patientId = new Types.ObjectId();
  patientModelMock.findById.mockReturnValue({
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue({
      _id: patientId,
      firstName: 'Patient',
      lastName: 'Test',
      email: 'patient@test.com',
      isActive: true,
      birthDate: null,
    }),
  });

  const result = await service.getUserByRole(
    UserRole.PATIENT,
    patientId.toString(),
  );

  expect(result).toMatchObject({
    role: UserRole.PATIENT,
    birthDate: null,
  });
});

it('getUserByRole should map admin payload', async () => {
  const adminId = new Types.ObjectId();
  adminModelMock.findById.mockReturnValue({
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue({
      _id: adminId,
      firstName: 'Admin',
      lastName: 'Test',
      email: 'admin@test.com',
      isActive: true,
    }),
  });

  const result = await service.getUserByRole(UserRole.ADMIN, adminId.toString());

  expect(result).toMatchObject({
    role: UserRole.ADMIN,
    email: 'admin@test.com',
  });
});

it('getUserByRole should throw when user does not exist', async () => {
  doctorModelMock.findById.mockReturnValue({
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(null),
  });
  await expect(
    service.getUserByRole(UserRole.DOCTOR, new Types.ObjectId().toString()),
  ).rejects.toBeInstanceOf(NotFoundException);
});
