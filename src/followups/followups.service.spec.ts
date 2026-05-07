import { NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { Consultation } from '../consultations/schemas/consultation.schema';
import { UserRole } from '../common/enums/user-role.enum';
import { buildRequestUser } from '../common/testing/request-test-helpers';
import { NotificationsService } from '../notifications/notifications.service';
import { TriageSession } from '../triage/schemas/triage-session.schema';
import { FOLLOWUPS_QUEUE } from './followups.constants';
import { FollowupsService } from './followups.service';
import { Followup } from './schemas/followup.schema';

describe('FollowupsService', () => {
  let service: FollowupsService;

  const followupModel = {
    create: jest.fn(),
    find: jest.fn(),
    findById: jest.fn(),
  };
  const consultationModel = {
    create: jest.fn(),
    findById: jest.fn(),
  };
  const triageSessionModel = {};
  const notificationsService = {
    createUserNotification: jest.fn(),
  };
  const followupsQueue = {
    add: jest.fn(),
  };

  const patientId = new Types.ObjectId();
  const doctorId = new Types.ObjectId();
  const consultationId = new Types.ObjectId();
  const followupId = new Types.ObjectId();

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FollowupsService,
        {
          provide: getModelToken(Followup.name),
          useValue: followupModel,
        },
        {
          provide: getModelToken(Consultation.name),
          useValue: consultationModel,
        },
        {
          provide: getModelToken(TriageSession.name),
          useValue: triageSessionModel,
        },
        {
          provide: NotificationsService,
          useValue: notificationsService,
        },
        {
          provide: FOLLOWUPS_QUEUE,
          useValue: followupsQueue,
        },
      ],
    }).compile();

    service = module.get<FollowupsService>(FollowupsService);
  });

  function mockLeanQuery(items: unknown[]) {
    return {
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(items),
    };
  }

  function followupDocument(
    overrides: Partial<{
      _id: Types.ObjectId;
      id: string;
      consultationId: Types.ObjectId;
      patientId: Types.ObjectId;
      doctorId: Types.ObjectId | null;
      scheduledAt: Date;
      reminderAt: Date;
      baselineSymptomSeverity: number;
      status: string;
      priorityEscalated: boolean;
      createdConsultationId?: Types.ObjectId;
      submittedAt?: Date;
      updatedAt?: Date;
      save: jest.Mock;
      toObject: () => unknown;
    }> = {},
  ) {
    const current = {
      _id: followupId,
      id: followupId.toString(),
      consultationId,
      patientId,
      doctorId,
      scheduledAt: new Date('2025-01-04T00:00:00.000Z'),
      reminderAt: new Date('2025-01-04T00:00:00.000Z'),
      baselineSymptomSeverity: 4,
      status: 'PENDING',
      priorityEscalated: false,
      save: jest.fn(),
      toObject() {
        return this;
      },
      ...overrides,
    };

    if (!current.toObject) {
      current.toObject = () => current;
    }

    return current;
  }

  it('creates two scheduled followups when a consultation is closed', async () => {
    const closedAt = new Date('2025-01-01T00:00:00.000Z');
    consultationModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: consultationId,
        patientId,
        assignedDoctorId: doctorId,
        baselineSymptomSeverity: 6,
        closedAt,
      }),
    });
    followupModel.create
      .mockResolvedValueOnce([
        followupDocument({
          _id: new Types.ObjectId(),
          id: 'f1',
          scheduledAt: new Date('2025-01-04T00:00:00.000Z'),
          reminderAt: new Date('2025-01-04T00:00:00.000Z'),
        }),
      ])
      .mockResolvedValueOnce([
        followupDocument({
          _id: new Types.ObjectId(),
          id: 'f2',
          scheduledAt: new Date('2025-01-08T00:00:00.000Z'),
          reminderAt: new Date('2025-01-08T00:00:00.000Z'),
        }),
      ]);

    const result = await service.handleConsultationClosedEvent(
      consultationId.toString(),
    );

    expect(result).toHaveLength(2);
    expect(followupModel.create).toHaveBeenCalledTimes(2);
    expect(followupsQueue.add).toHaveBeenCalledTimes(4);
  });

  it('returns followups for the authenticated patient', async () => {
    const query = mockLeanQuery([
      {
        _id: followupId,
        consultationId,
        patientId,
        doctorId,
        scheduledAt: new Date('2025-01-04T00:00:00.000Z'),
        reminderAt: new Date('2025-01-04T00:00:00.000Z'),
        status: 'PENDING',
        baselineSymptomSeverity: 4,
        priorityEscalated: false,
      },
    ]);
    followupModel.find.mockReturnValue(query);

    const result = await service.getMine(
      buildRequestUser({
        userId: patientId.toString(),
        role: UserRole.PATIENT,
        email: 'patient@test.com',
      }),
      'PENDING',
    );

    expect(followupModel.find).toHaveBeenCalledWith({
      patientId: new Types.ObjectId(patientId.toString()),
      status: 'PENDING',
    });
    expect(result.items[0]).toMatchObject({
      id: followupId.toString(),
      consultationId: consultationId.toString(),
      patientId: patientId.toString(),
      doctorId: doctorId.toString(),
      status: 'PENDING',
    });
  });

  it('throws when a patient tries to read another patients followup', async () => {
    followupModel.findById.mockReturnValue({
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue({
        _id: followupId,
        patientId,
        doctorId,
      }),
    });

    await expect(
      service.getById(
        followupId.toString(),
        buildRequestUser({
          userId: new Types.ObjectId().toString(),
          role: UserRole.PATIENT,
          email: 'other@test.com',
        }),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('submits a worsening followup and opens an escalated consultation', async () => {
    const existingFollowup = followupDocument({
      status: 'PENDING',
      doctorId,
      baselineSymptomSeverity: 3,
    });
    followupModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(existingFollowup),
    });
    consultationModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue({
        patientId,
        triageSessionId: new Types.ObjectId(),
        specialty: 'GENERAL_MEDICINE',
        priority: 'LOW',
      }),
    });
    consultationModel.create.mockResolvedValue([
      { _id: new Types.ObjectId(), id: 'consult-escalated' },
    ]);

    const result = await service.submit(
      buildRequestUser({
        userId: patientId.toString(),
        role: UserRole.PATIENT,
        email: 'patient@test.com',
      }),
      {
        followupId: followupId.toString(),
        currentSymptomSeverity: 6,
        change: 'WORSE',
        medicationTaken: true,
        medicationNotes: 'Ibuprofeno',
        newSymptoms: 'Fiebre',
      },
    );

    expect(existingFollowup.save).toHaveBeenCalled();
    expect(consultationModel.create).toHaveBeenCalled();
    expect(notificationsService.createUserNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: doctorId.toString(),
        type: 'FOLLOWUP_PRIORITY_ESCALATED',
        resourceId: 'consult-escalated',
      }),
    );
    expect(result.priorityEscalated).toBe(true);
    expect(result.createdConsultationId).toBe('consult-escalated');
  });

  it('marks due followups and sends reminder notification', async () => {
    const currentFollowup = followupDocument({
      status: 'PENDING',
    });
    followupModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(currentFollowup),
    });

    await service.markDue(followupId.toString());

    expect(currentFollowup.save).toHaveBeenCalled();
    expect(currentFollowup.status).toBe('REMINDED');
    const [notificationArg] = notificationsService.createUserNotification.mock
      .calls[0] as [
      {
        userId: string;
        type: string;
        sourceEventId: string;
        push?: { title: string };
      },
    ];
    expect(notificationArg.userId).toBe(patientId.toString());
    expect(notificationArg.type).toBe('FOLLOWUP_REMINDER');
    expect(notificationArg.sourceEventId).toBe(
      `followup-due:${followupId.toString()}`,
    );
    expect(notificationArg.push?.title).toBe('Seguimiento pendiente');
  });

  it('marks reminded followups as missed', async () => {
    const currentFollowup = followupDocument({
      status: 'REMINDED',
    });
    followupModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(currentFollowup),
    });

    await service.markMissed(followupId.toString());

    expect(currentFollowup.status).toBe('MISSED');
    expect(currentFollowup.save).toHaveBeenCalled();
  });
});
