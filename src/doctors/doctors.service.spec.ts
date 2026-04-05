import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { DoctorStatus } from '../common/enums/doctor-status.enum';
import { OutboxDispatcherService } from '../outbox/outbox-dispatcher.service';
import { OutboxService } from '../outbox/outbox.service';
import { DoctorsService } from './doctors.service';
import { Doctor } from './schemas/doctor.schema';
import { RethusVerification } from './schemas/rethus-verification.schema';

function createFindChain(result: unknown) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(result),
    sort: jest.fn().mockReturnThis(),
    session: jest.fn().mockReturnThis(),
  };
}

describe('DoctorsService', () => {
  let service: DoctorsService;
  const doctorModel = {
    findById: jest.fn(),
  };
  const rethusVerificationModel = {
    findOne: jest.fn(),
    create: jest.fn(),
  };
  const connectionMock = {
    startSession: jest.fn(),
  };
  const sessionMock = {
    withTransaction: jest.fn(),
    endSession: jest.fn(),
  };
  const outboxServiceMock = {
    createDoctorVerificationChangedEvent: jest.fn(),
  };
  const outboxDispatcherServiceMock = {
    dispatchPendingEvents: jest.fn(),
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
        DoctorsService,
        { provide: getConnectionToken(), useValue: connectionMock },
        { provide: getModelToken(Doctor.name), useValue: doctorModel },
        {
          provide: getModelToken(RethusVerification.name),
          useValue: rethusVerificationModel,
        },
        { provide: OutboxService, useValue: outboxServiceMock },
        {
          provide: OutboxDispatcherService,
          useValue: outboxDispatcherServiceMock,
        },
      ],
    }).compile();

    service = module.get<DoctorsService>(DoctorsService);
  });

  it('getMe should return doctor and latest verification', async () => {
    const id = new Types.ObjectId().toString();
    doctorModel.findById.mockReturnValue(
      createFindChain({
        _id: id,
        firstName: 'Laura',
        lastName: 'Medina',
        email: 'doc@example.com',
        role: 'DOCTOR',
        specialty: 'GENERAL_MEDICINE',
        doctorStatus: 'VERIFIED',
      }),
    );
    rethusVerificationModel.findOne.mockReturnValue(
      createFindChain({
        programType: 'UNIVERSITY',
        titleObtainingOrigin: 'LOCAL',
        professionOccupation: 'MEDICO GENERAL',
        startDate: new Date('2024-01-15'),
        rethusState: 'VALID',
        administrativeAct: 'ACT-2026-001',
        reportingEntity: 'MINISTERIO DE SALUD',
        checkedAt: new Date('2026-03-01T00:00:00.000Z'),
        checkedBy: 'admin',
        evidenceUrl: null,
        notes: 'ok',
      }),
    );

    const result = await service.getMe({
      userId: id,
      email: 'doc@example.com',
      role: 'DOCTOR',
      isActive: true,
    });

    expect(result).toMatchObject({
      firstName: 'Laura',
      doctorStatus: 'VERIFIED',
      verification: {
        programType: 'UNIVERSITY',
        titleObtainingOrigin: 'LOCAL',
      },
    });
  });

  it('getMe should return null verification when not found', async () => {
    const id = new Types.ObjectId().toString();
    doctorModel.findById.mockReturnValue(
      createFindChain({
        _id: id,
        firstName: 'Laura',
        lastName: 'Medina',
        email: 'doc@example.com',
        role: 'DOCTOR',
        specialty: 'GENERAL_MEDICINE',
        doctorStatus: 'PENDING',
      }),
    );
    rethusVerificationModel.findOne.mockReturnValue(createFindChain(null));

    const result = await service.getMe({
      userId: id,
      email: 'doc@example.com',
      role: 'DOCTOR',
      isActive: true,
    });

    expect(result.verification).toBeNull();
  });

  it('getMe should throw when doctor not found', async () => {
    doctorModel.findById.mockReturnValue(createFindChain(null));
    await expect(
      service.getMe({
        userId: 'missing',
        email: 'missing@example.com',
        role: 'DOCTOR',
        isActive: true,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getMe should handle verification with null fields', async () => {
    const id = new Types.ObjectId().toString();
    doctorModel.findById.mockReturnValue(
      createFindChain({
        _id: id,
        firstName: 'Laura',
        lastName: 'Medina',
        email: 'doc@example.com',
        role: 'DOCTOR',
        specialty: null,
        doctorStatus: null,
      }),
    );
    rethusVerificationModel.findOne.mockReturnValue(
      createFindChain({
        programType: null,
        titleObtainingOrigin: null,
        professionOccupation: null,
        startDate: null,
        rethusState: null,
        administrativeAct: null,
        reportingEntity: null,
        checkedAt: null,
        checkedBy: null,
        evidenceUrl: null,
        notes: null,
      }),
    );
    const result = await service.getMe({
      userId: id,
      email: 'doc@example.com',
      role: 'DOCTOR',
      isActive: true,
    });
    expect(result.specialty).toBeNull();
    expect(result.doctorStatus).toBeNull();
    expect(result.verification).toBeDefined();
    expect(result.verification.programType).toBeNull();
  });

  it('rethusResubmit should set status to pending and emit outbox', async () => {
    const doctorId = new Types.ObjectId().toString();
    const doctorDocument = {
      id: doctorId,
      _id: new Types.ObjectId(doctorId),
      doctorStatus: DoctorStatus.REJECTED,
      save: jest.fn().mockResolvedValue(undefined),
      rethusVerification: undefined,
    };

    doctorModel.findById.mockReturnValue({
      session: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(doctorDocument),
    });

    rethusVerificationModel.findOne.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      session: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(null),
    });

    rethusVerificationModel.create.mockResolvedValue([
      {
        _id: 'verification-id',
        rethusState: 'PENDING',
        checkedBy: 'doc@example.com',
        evidenceUrl: 'https://example.com/rethus.pdf',
        notes: 'updated',
      },
    ]);

    const result = await service.rethusResubmit(
      {
        userId: doctorId,
        email: 'doc@example.com',
        role: 'DOCTOR',
        isActive: true,
      },
      {
        evidenceUrl: 'https://example.com/rethus.pdf',
        notes: 'updated',
      },
    );

    expect(result.doctorStatus).toBe(DoctorStatus.PENDING);
    expect(doctorDocument.save).toHaveBeenCalled();
    expect(
      outboxServiceMock.createDoctorVerificationChangedEvent,
    ).toHaveBeenCalled();
    expect(
      outboxDispatcherServiceMock.dispatchPendingEvents,
    ).toHaveBeenCalled();
  });

  it('rethusResubmit should reject non-rejected doctor', async () => {
    const doctorId = new Types.ObjectId().toString();
    doctorModel.findById.mockReturnValue({
      session: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue({
        id: doctorId,
        _id: new Types.ObjectId(doctorId),
        doctorStatus: DoctorStatus.VERIFIED,
      }),
    });

    await expect(
      service.rethusResubmit(
        {
          userId: doctorId,
          email: 'doc@example.com',
          role: 'DOCTOR',
          isActive: true,
        },
        { notes: 'nueva evidencia' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rethusResubmit should map unexpected errors', async () => {
    const doctorId = new Types.ObjectId().toString();
    doctorModel.findById.mockReturnValue({
      session: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue({
        id: doctorId,
        _id: new Types.ObjectId(doctorId),
        doctorStatus: DoctorStatus.REJECTED,
      }),
    });
    rethusVerificationModel.findOne.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      session: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(null),
    });
    rethusVerificationModel.create.mockRejectedValue(new Error('db fail'));

    await expect(
      service.rethusResubmit(
        {
          userId: doctorId,
          email: 'doc@example.com',
          role: 'DOCTOR',
          isActive: true,
        },
        { notes: 'nueva evidencia' },
      ),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
