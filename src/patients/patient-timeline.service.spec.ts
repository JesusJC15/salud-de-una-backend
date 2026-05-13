import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { UserRole } from '../common/enums/user-role.enum';
import { buildRequestUser } from '../common/testing/request-test-helpers';
import { Doctor } from '../doctors/schemas/doctor.schema';
import { PatientTimelineService } from './patient-timeline.service';
import {
  createSelectLeanQuery,
  createTimelineModelProviders,
  EMPTY_TIMELINE_RESULT,
} from './patients.spec-helpers';

describe('PatientTimelineService', () => {
  let service: PatientTimelineService;

  const doctorModel = {
    findById: jest.fn(),
  };
  const consultationModel = {
    find: jest.fn(),
    exists: jest.fn(),
  };
  const triageSessionModel = {
    find: jest.fn(),
  };
  const followupModel = {
    find: jest.fn(),
  };

  const patientId = new Types.ObjectId();
  const doctorId = new Types.ObjectId();

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientTimelineService,
        { provide: getModelToken(Doctor.name), useValue: doctorModel },
        ...createTimelineModelProviders({
          consultationModel,
          triageSessionModel,
          followupModel,
        }),
      ],
    }).compile();

    service = module.get<PatientTimelineService>(PatientTimelineService);
  });

  it('rejects invalid patient ids', async () => {
    await expect(
      service.getTimeline(
        buildRequestUser({
          userId: patientId.toString(),
          role: UserRole.ADMIN,
          email: 'admin@test.com',
        }),
        'invalid',
        {},
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('prevents patients from reading another patients timeline', async () => {
    await expect(
      service.getTimeline(
        buildRequestUser({
          userId: new Types.ObjectId().toString(),
          role: UserRole.PATIENT,
          email: 'patient@test.com',
        }),
        patientId.toString(),
        {},
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('prevents doctors without prior consultations from reading the timeline', async () => {
    doctorModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue({ _id: doctorId }),
    });
    consultationModel.exists.mockReturnValue({
      exec: jest.fn().mockResolvedValue(false),
    });

    await expect(
      service.getTimeline(
        buildRequestUser({
          userId: doctorId.toString(),
          role: UserRole.DOCTOR,
          email: 'doctor@test.com',
        }),
        patientId.toString(),
        {},
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects doctors that do not exist in the system', async () => {
    doctorModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(null),
    });

    await expect(
      service.getTimeline(
        buildRequestUser({
          userId: doctorId.toString(),
          role: UserRole.DOCTOR,
          email: 'doctor@test.com',
        }),
        patientId.toString(),
        {},
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows a patient to read their own timeline and returns no next cursor when under limit', async () => {
    triageSessionModel.find.mockReturnValue(createSelectLeanQuery([]));
    consultationModel.find.mockReturnValue(createSelectLeanQuery([]));
    followupModel.find.mockReturnValue(createSelectLeanQuery([]));

    const result = await service.getTimeline(
      buildRequestUser({
        userId: patientId.toString(),
        role: UserRole.PATIENT,
        email: 'patient@test.com',
      }),
      patientId.toString(),
      { limit: 5 },
    );

    expect(result).toEqual(EMPTY_TIMELINE_RESULT);
  });

  it('allows doctors with prior consultations to read the timeline', async () => {
    doctorModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue({ _id: doctorId }),
    });
    consultationModel.exists.mockReturnValue({
      exec: jest.fn().mockResolvedValue(true),
    });
    triageSessionModel.find.mockReturnValue(createSelectLeanQuery([]));
    consultationModel.find.mockReturnValue(createSelectLeanQuery([]));
    followupModel.find.mockReturnValue(createSelectLeanQuery([]));

    const result = await service.getTimeline(
      buildRequestUser({
        userId: doctorId.toString(),
        role: UserRole.DOCTOR,
        email: 'doctor@test.com',
      }),
      patientId.toString(),
      {},
    );

    expect(result.items).toEqual([]);
  });

  it('uses createdAt fallback for triage events without completedAt', async () => {
    const triageId = new Types.ObjectId();
    triageSessionModel.find.mockReturnValue(
      createSelectLeanQuery([
        {
          _id: triageId,
          specialty: 'GENERAL_MEDICINE',
          completedAt: null,
          createdAt: new Date('2025-01-01T10:00:00.000Z'),
        },
      ]),
    );
    consultationModel.find.mockReturnValue(createSelectLeanQuery([]));
    followupModel.find.mockReturnValue(createSelectLeanQuery([]));

    const result = await service.getTimeline(
      buildRequestUser({
        userId: patientId.toString(),
        role: UserRole.PATIENT,
        email: 'patient@test.com',
      }),
      patientId.toString(),
      {},
    );

    expect(result.items).toEqual([
      expect.objectContaining({
        type: 'TRIAGE_COMPLETED',
        occurredAt: '2025-01-01T10:00:00.000Z',
      }),
    ]);
  });

  it('adds assignment and closure events for consultations independently', async () => {
    const consultationId = new Types.ObjectId();
    triageSessionModel.find.mockReturnValue(createSelectLeanQuery([]));
    consultationModel.find.mockReturnValue(
      createSelectLeanQuery([
        {
          _id: consultationId,
          specialty: 'CARDIOLOGY',
          priority: 'HIGH',
          assignedAt: new Date('2025-01-02T00:00:00.000Z'),
          closedAt: new Date('2025-01-03T00:00:00.000Z'),
        },
      ]),
    );
    followupModel.find.mockReturnValue(createSelectLeanQuery([]));

    const result = await service.getTimeline(
      buildRequestUser({
        userId: patientId.toString(),
        role: UserRole.PATIENT,
        email: 'patient@test.com',
      }),
      patientId.toString(),
      {},
    );

    expect(result.items.map((item) => item.type)).toEqual([
      'CONSULTATION_CLOSED',
      'CONSULTATION_ASSIGNED',
    ]);
  });

  it('uses scheduledAt fallback for followup created events and omits escalation when missing consultation id', async () => {
    const followupId = new Types.ObjectId();
    triageSessionModel.find.mockReturnValue(createSelectLeanQuery([]));
    consultationModel.find.mockReturnValue(createSelectLeanQuery([]));
    followupModel.find.mockReturnValue(
      createSelectLeanQuery([
        {
          _id: followupId,
          scheduledAt: new Date('2025-01-04T00:00:00.000Z'),
          submittedAt: null,
          createdAt: null,
          updatedAt: null,
          createdConsultationId: null,
          priorityEscalated: true,
          status: 'PENDING',
        },
      ]),
    );

    const result = await service.getTimeline(
      buildRequestUser({
        userId: patientId.toString(),
        role: UserRole.PATIENT,
        email: 'patient@test.com',
      }),
      patientId.toString(),
      {},
    );

    expect(result.items).toEqual([
      expect.objectContaining({
        type: 'FOLLOWUP_CREATED',
        occurredAt: '2025-01-04T00:00:00.000Z',
      }),
    ]);
  });

  it('adds a followup due event when the followup is reminded but not submitted', async () => {
    const followupId = new Types.ObjectId();
    triageSessionModel.find.mockReturnValue(createSelectLeanQuery([]));
    consultationModel.find.mockReturnValue(createSelectLeanQuery([]));
    followupModel.find.mockReturnValue(
      createSelectLeanQuery([
        {
          _id: followupId,
          scheduledAt: new Date('2025-01-04T00:00:00.000Z'),
          submittedAt: null,
          createdAt: new Date('2025-01-03T00:00:00.000Z'),
          createdConsultationId: null,
          priorityEscalated: false,
          status: 'REMINDED',
        },
      ]),
    );

    const result = await service.getTimeline(
      buildRequestUser({
        userId: patientId.toString(),
        role: UserRole.PATIENT,
        email: 'patient@test.com',
      }),
      patientId.toString(),
      {},
    );

    expect(result.items.map((item) => item.type)).toEqual([
      'FOLLOWUP_DUE',
      'FOLLOWUP_CREATED',
    ]);
  });

  it('uses updatedAt fallback for escalation events when submittedAt is missing', async () => {
    const followupId = new Types.ObjectId();
    triageSessionModel.find.mockReturnValue(createSelectLeanQuery([]));
    consultationModel.find.mockReturnValue(createSelectLeanQuery([]));
    followupModel.find.mockReturnValue(
      createSelectLeanQuery([
        {
          _id: followupId,
          scheduledAt: new Date('2025-01-04T00:00:00.000Z'),
          submittedAt: null,
          createdAt: null,
          updatedAt: new Date('2025-01-04T05:00:00.000Z'),
          createdConsultationId: new Types.ObjectId(),
          priorityEscalated: true,
          status: 'PENDING',
        },
      ]),
    );

    const result = await service.getTimeline(
      buildRequestUser({
        userId: patientId.toString(),
        role: UserRole.PATIENT,
        email: 'patient@test.com',
      }),
      patientId.toString(),
      {},
    );

    expect(result.items[0]).toMatchObject({
      type: 'PRIORITY_ESCALATED',
      occurredAt: '2025-01-04T05:00:00.000Z',
    });
  });

  it('builds a sorted timeline with cursor pagination for admins', async () => {
    const triageId = new Types.ObjectId();
    const consultationId = new Types.ObjectId();
    const followupId = new Types.ObjectId();

    triageSessionModel.find.mockReturnValue(
      createSelectLeanQuery([
        {
          _id: triageId,
          specialty: 'GENERAL_MEDICINE',
          completedAt: new Date('2025-01-01T00:00:00.000Z'),
          createdAt: new Date('2024-12-31T00:00:00.000Z'),
        },
      ]),
    );
    consultationModel.find.mockReturnValue(
      createSelectLeanQuery([
        {
          _id: consultationId,
          specialty: 'CARDIOLOGY',
          priority: 'HIGH',
          assignedAt: new Date('2025-01-03T00:00:00.000Z'),
          closedAt: new Date('2025-01-04T00:00:00.000Z'),
        },
      ]),
    );
    followupModel.find.mockReturnValue(
      createSelectLeanQuery([
        {
          _id: followupId,
          scheduledAt: new Date('2025-01-05T00:00:00.000Z'),
          submittedAt: new Date('2025-01-06T00:00:00.000Z'),
          createdAt: new Date('2025-01-04T12:00:00.000Z'),
          updatedAt: new Date('2025-01-06T01:00:00.000Z'),
          createdConsultationId: new Types.ObjectId(),
          priorityEscalated: true,
          status: 'REMINDED',
        },
      ]),
    );

    const firstPage = await service.getTimeline(
      buildRequestUser({
        userId: new Types.ObjectId().toString(),
        role: UserRole.ADMIN,
        email: 'admin@test.com',
      }),
      patientId.toString(),
      { limit: 2 },
    );

    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.items.map((item) => item.type)).toEqual([
      'FOLLOWUP_COMPLETED',
      'PRIORITY_ESCALATED',
    ]);
    expect(firstPage.nextCursor).toBe(firstPage.items[1].occurredAt);

    const secondPage = await service.getTimeline(
      buildRequestUser({
        userId: new Types.ObjectId().toString(),
        role: UserRole.ADMIN,
        email: 'admin@test.com',
      }),
      patientId.toString(),
      { limit: 10, cursor: firstPage.nextCursor! },
    );

    expect(
      secondPage.items.every((item) => item.occurredAt < firstPage.nextCursor!),
    ).toBe(true);
  });
});
