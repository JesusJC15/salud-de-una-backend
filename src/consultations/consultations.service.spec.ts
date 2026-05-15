import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { ClientSession, Types } from 'mongoose';
import { AiService } from '../ai/ai.service';
import { UserRole } from '../common/enums/user-role.enum';
import { Specialty } from '../common/enums/specialty.enum';
import { buildRequestUser } from '../common/testing/request-test-helpers';
import { Doctor } from '../doctors/schemas/doctor.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { OutboxDispatcherService } from '../outbox/outbox-dispatcher.service';
import { OutboxService } from '../outbox/outbox.service';
import { Patient } from '../patients/schemas/patient.schema';
import { RagService } from '../rag/rag.service';
import { TriageSession } from '../triage/schemas/triage-session.schema';
import { ChatService } from '../chat/chat.service';
import { ConsultationsService } from './consultations.service';
import { Consultation } from './schemas/consultation.schema';

describe('ConsultationsService', () => {
  let service: ConsultationsService;

  const findExecMock = jest.fn();
  const findChain = {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: findExecMock,
  };

  const consultationModel = {
    create: jest.fn(),
    find: jest.fn().mockReturnValue(findChain),
    findById: jest.fn(),
    findOneAndUpdate: jest.fn(),
    countDocuments: jest.fn(),
  };
  const doctorModel = {
    findById: jest.fn(),
    find: jest.fn(),
  };
  const patientModel = {
    findById: jest.fn(),
  };
  const triageSessionModel = {
    findById: jest.fn(),
  };
  const aiService = {
    generateText: jest.fn(),
  };
  const notificationsService = {
    createUserNotification: jest.fn(),
  };
  const outboxService = {
    createConsultationClosedEvent: jest.fn(),
  };
  const outboxDispatcherService = {
    dispatchPendingEvents: jest.fn(),
  };
  const chatService = {
    getMessages: jest.fn(),
  };
  const ragService = {
    buildConsultationSummary: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    findExecMock.mockResolvedValue([]);
    patientModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(null),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConsultationsService,
        {
          provide: getModelToken(Consultation.name),
          useValue: consultationModel,
        },
        {
          provide: getModelToken(Doctor.name),
          useValue: doctorModel,
        },
        {
          provide: getModelToken(Patient.name),
          useValue: patientModel,
        },
        {
          provide: getModelToken(TriageSession.name),
          useValue: triageSessionModel,
        },
        {
          provide: AiService,
          useValue: aiService,
        },
        {
          provide: NotificationsService,
          useValue: notificationsService,
        },
        {
          provide: OutboxService,
          useValue: outboxService,
        },
        {
          provide: OutboxDispatcherService,
          useValue: outboxDispatcherService,
        },
        {
          provide: ChatService,
          useValue: chatService,
        },
        {
          provide: RagService,
          useValue: ragService,
        },
      ],
    }).compile();

    service = module.get<ConsultationsService>(ConsultationsService);
  });

  it('creates consultation using string ids without session', async () => {
    consultationModel.create.mockResolvedValue([{ _id: new Types.ObjectId() }]);

    await service.createFromTriage({
      patientId: new Types.ObjectId().toString(),
      triageSessionId: new Types.ObjectId().toString(),
      specialty: Specialty.GENERAL_MEDICINE,
      priority: 'HIGH',
    });

    expect(consultationModel.create).toHaveBeenCalledTimes(1);
    const [payload, options] = consultationModel.create.mock.calls[0] as [
      Array<{
        patientId: Types.ObjectId;
        triageSessionId: Types.ObjectId;
      }>,
      unknown,
    ];

    expect(payload[0].patientId).toBeInstanceOf(Types.ObjectId);
    expect(payload[0].triageSessionId).toBeInstanceOf(Types.ObjectId);
    expect(options).toBeUndefined();
  });

  it('creates consultation using object ids with session', async () => {
    consultationModel.create.mockResolvedValue([{ _id: new Types.ObjectId() }]);
    const patientId = new Types.ObjectId();
    const triageSessionId = new Types.ObjectId();
    const session = { id: 'tx-1' } as unknown as ClientSession;

    await service.createFromTriage(
      {
        patientId,
        triageSessionId,
        specialty: Specialty.ODONTOLOGY,
        priority: 'LOW',
      },
      session,
    );

    expect(consultationModel.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          patientId,
          triageSessionId,
          specialty: Specialty.ODONTOLOGY,
          priority: 'LOW',
          status: 'PENDING',
        }),
      ],
      { session },
    );
  });

  it('returns paginated queue using clamped defaults', async () => {
    const consultationId = new Types.ObjectId();
    const patientId = new Types.ObjectId();
    const triageSessionId = new Types.ObjectId();
    findExecMock.mockResolvedValue([
      {
        _id: consultationId,
        patientId,
        triageSessionId,
        specialty: Specialty.GENERAL_MEDICINE,
        priority: 'MODERATE',
        status: 'PENDING',
        createdAt: null,
      },
    ]);

    const result = await service.getQueue({ limit: 999, page: 0 });

    expect(result).toEqual({
      items: [
        {
          id: consultationId.toString(),
          patientId: patientId.toString(),
          triageSessionId: triageSessionId.toString(),
          specialty: Specialty.GENERAL_MEDICINE,
          priority: 'MODERATE',
          status: 'PENDING',
          createdAt: null,
        },
      ],
    });
    expect(consultationModel.find).toHaveBeenCalledWith({ status: 'PENDING' });
    expect(findChain.select).toHaveBeenCalledWith(
      '_id patientId triageSessionId specialty priority status createdAt',
    );
  });

  it('filters doctor queue by doctor specialty plus urgent care', async () => {
    const doctorId = new Types.ObjectId();
    doctorModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue({
        specialty: Specialty.ODONTOLOGY,
      }),
    });
    findExecMock.mockResolvedValue([]);

    await service.getQueue(
      buildRequestUser({
        userId: doctorId.toString(),
        role: UserRole.DOCTOR,
        email: 'doctor@test.com',
      }),
    );

    expect(consultationModel.find).toHaveBeenCalledWith({
      status: 'PENDING',
      specialty: { $in: [Specialty.ODONTOLOGY, Specialty.URGENT_CARE] },
    });
  });

  it('calculates skip using provided page and limit', async () => {
    const baseDate = new Date('2026-04-07T00:00:00.000Z');
    findExecMock.mockResolvedValue([
      {
        _id: new Types.ObjectId(),
        patientId: new Types.ObjectId(),
        triageSessionId: new Types.ObjectId(),
        specialty: Specialty.GENERAL_MEDICINE,
        priority: 'HIGH',
        status: 'PENDING',
        createdAt: new Date(baseDate.getTime() + 1000),
      },
      {
        _id: new Types.ObjectId(),
        patientId: new Types.ObjectId(),
        triageSessionId: new Types.ObjectId(),
        specialty: Specialty.GENERAL_MEDICINE,
        priority: 'MODERATE',
        status: 'PENDING',
        createdAt: new Date(baseDate.getTime() + 2000),
      },
      {
        _id: new Types.ObjectId(),
        patientId: new Types.ObjectId(),
        triageSessionId: new Types.ObjectId(),
        specialty: Specialty.GENERAL_MEDICINE,
        priority: 'LOW',
        status: 'PENDING',
        createdAt: new Date(baseDate.getTime() + 3000),
      },
    ]);

    const result = await service.getQueue({ limit: 1, page: 2 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].priority).toBe('MODERATE');
  });

  it('uses default pagination values when options are not provided', async () => {
    findExecMock.mockResolvedValue([]);

    const result = await service.getQueue();

    expect(result).toEqual({ items: [] });
  });

  it('clamps limit to minimum value', async () => {
    findExecMock.mockResolvedValue([
      {
        _id: new Types.ObjectId(),
        patientId: new Types.ObjectId(),
        triageSessionId: new Types.ObjectId(),
        specialty: Specialty.GENERAL_MEDICINE,
        priority: 'HIGH',
        status: 'PENDING',
        createdAt: null,
      },
      {
        _id: new Types.ObjectId(),
        patientId: new Types.ObjectId(),
        triageSessionId: new Types.ObjectId(),
        specialty: Specialty.GENERAL_MEDICINE,
        priority: 'LOW',
        status: 'PENDING',
        createdAt: null,
      },
    ]);

    const result = await service.getQueue({ limit: -3, page: 2 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].priority).toBe('LOW');
  });

  it('uses createdAt as tie-breaker when priorities are equal', async () => {
    const older = new Date('2026-04-07T00:00:00.000Z');
    const newer = new Date('2026-04-08T00:00:00.000Z');
    const firstId = new Types.ObjectId();
    const secondId = new Types.ObjectId();

    findExecMock.mockResolvedValue([
      {
        _id: secondId,
        patientId: new Types.ObjectId(),
        triageSessionId: new Types.ObjectId(),
        specialty: Specialty.GENERAL_MEDICINE,
        priority: 'LOW',
        status: 'PENDING',
        createdAt: newer,
      },
      {
        _id: firstId,
        patientId: new Types.ObjectId(),
        triageSessionId: new Types.ObjectId(),
        specialty: Specialty.GENERAL_MEDICINE,
        priority: 'LOW',
        status: 'PENDING',
        createdAt: older,
      },
    ]);

    const result = await service.getQueue({ limit: 10, page: 1 });

    expect(result.items[0].id).toBe(firstId.toString());
    expect(result.items[1].id).toBe(secondId.toString());
  });

  it('sends unknown priorities to the end using fallback rank', async () => {
    const knownId = new Types.ObjectId();
    const unknownId = new Types.ObjectId();

    findExecMock.mockResolvedValue([
      {
        _id: unknownId,
        patientId: new Types.ObjectId(),
        triageSessionId: new Types.ObjectId(),
        specialty: Specialty.GENERAL_MEDICINE,
        priority: 'UNKNOWN' as unknown as 'LOW',
        status: 'PENDING',
        createdAt: null,
      },
      {
        _id: knownId,
        patientId: new Types.ObjectId(),
        triageSessionId: new Types.ObjectId(),
        specialty: Specialty.GENERAL_MEDICINE,
        priority: 'LOW',
        status: 'PENDING',
        createdAt: null,
      },
    ]);

    const result = await service.getQueue({ limit: 10, page: 1 });

    expect(result.items[0].id).toBe(knownId.toString());
    expect(result.items[1].id).toBe(unknownId.toString());
  });

  it('returns consultation details for the owning patient', async () => {
    const consultationId = new Types.ObjectId();
    const triageSessionId = new Types.ObjectId();
    const patientId = new Types.ObjectId();
    consultationModel.findById.mockReturnValueOnce({
      exec: jest.fn().mockResolvedValue({
        _id: consultationId,
        patientId,
        triageSessionId,
        specialty: Specialty.GENERAL_MEDICINE,
        priority: 'HIGH',
        status: 'IN_ATTENTION',
        assignedDoctorId: new Types.ObjectId(),
        updatedAt: new Date('2025-01-02T00:00:00.000Z'),
      }),
    });
    triageSessionModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue({
        status: 'COMPLETED',
        answers: [
          {
            questionId: 'q1',
            questionText: 'Dolor',
            answerValue: 'Alto',
          },
        ],
        analysis: {
          priority: 'HIGH',
          redFlags: [{ severity: 'HIGH', evidence: 'fiebre' }],
          aiSummary: 'Resumen',
        },
      }),
    });

    const result = await service.getById(
      consultationId.toString(),
      buildRequestUser({
        userId: patientId.toString(),
        role: UserRole.PATIENT,
        email: 'patient@test.com',
      }),
    );

    expect(result).toMatchObject({
      id: consultationId.toString(),
      triage: {
        status: 'COMPLETED',
      },
    });
  });

  it('assigns a pending consultation to a verified doctor', async () => {
    const consultationId = new Types.ObjectId();
    const patientId = new Types.ObjectId();
    const doctorId = new Types.ObjectId();
    doctorModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue({
        doctorStatus: 'VERIFIED',
        availabilityStatus: 'AVAILABLE',
        specialty: Specialty.GENERAL_MEDICINE,
      }),
    });
    const consultation = {
      id: consultationId.toString(),
      patientId,
      status: 'IN_ATTENTION',
      assignedDoctorId: doctorId,
      updatedAt: new Date('2025-01-03T00:00:00.000Z'),
    };
    consultationModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(consultation),
    });

    const result = await service.assign(
      consultationId.toString(),
      buildRequestUser({
        userId: doctorId.toString(),
        role: UserRole.DOCTOR,
        email: 'doctor@test.com',
      }),
    );

    expect(consultationModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: consultationId,
        status: 'PENDING',
        specialty: {
          $in: [Specialty.GENERAL_MEDICINE, Specialty.URGENT_CARE],
        },
      },
      expect.any(Object),
      { returnDocument: 'after' },
    );
    const [, updateArg] = consultationModel.findOneAndUpdate.mock.calls[0] as [
      unknown,
      {
        $set: {
          status: string;
          assignedDoctorId: Types.ObjectId;
          assignedAt: Date;
        };
      },
      unknown,
    ];
    expect(updateArg.$set.status).toBe('IN_ATTENTION');
    expect(updateArg.$set.assignedDoctorId.toString()).toBe(
      doctorId.toString(),
    );
    expect(updateArg.$set.assignedAt).toBeInstanceOf(Date);
    expect(notificationsService.createUserNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: patientId.toString(),
        type: 'CONSULTATION_ASSIGNED',
      }),
    );
    expect(result.status).toBe('IN_ATTENTION');
  });

  it('assign rejects races when the consultation was already claimed', async () => {
    const consultationId = new Types.ObjectId();
    doctorModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue({
        doctorStatus: 'VERIFIED',
        availabilityStatus: 'AVAILABLE',
        specialty: Specialty.GENERAL_MEDICINE,
      }),
    });
    consultationModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });
    consultationModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue({
        status: 'IN_ATTENTION',
      }),
    });

    await expect(
      service.assign(
        consultationId.toString(),
        buildRequestUser({
          userId: new Types.ObjectId().toString(),
          role: UserRole.DOCTOR,
          email: 'doctor@test.com',
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('closes an assigned consultation and emits the outbox event', async () => {
    const consultationId = new Types.ObjectId();
    const patientId = new Types.ObjectId();
    const doctorId = new Types.ObjectId();
    const consultation = {
      id: consultationId.toString(),
      patientId,
      assignedDoctorId: doctorId,
      status: 'IN_ATTENTION',
      save: jest.fn(),
      closedAt: undefined as Date | undefined,
    };
    consultationModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(consultation),
    });

    const result = await service.close(
      consultationId.toString(),
      buildRequestUser({
        userId: doctorId.toString(),
        role: UserRole.DOCTOR,
        email: 'doctor@test.com',
      }),
      {
        baselineSymptomSeverity: 5,
        redFlagsConfirmed: true,
      },
      'corr-123',
    );

    expect(consultation.save).toHaveBeenCalled();
    expect(outboxService.createConsultationClosedEvent).toHaveBeenCalledWith(
      { consultationId: consultationId.toString() },
      'corr-123',
    );
    expect(outboxDispatcherService.dispatchPendingEvents).toHaveBeenCalled();
    expect(result.status).toBe('CLOSED');
  });

  it('generates a clinical summary from AI response', async () => {
    const consultationId = new Types.ObjectId();
    const doctorId = new Types.ObjectId();
    const patientId = new Types.ObjectId();
    const triageSessionId = new Types.ObjectId();
    const consultation = {
      id: consultationId.toString(),
      assignedDoctorId: doctorId,
      patientId,
      triageSessionId,
      priority: 'MODERATE',
      save: jest.fn(),
      updatedAt: new Date('2025-01-04T00:00:00.000Z'),
      clinicalSummary: '',
    };
    consultationModel.findById.mockReturnValueOnce({
      exec: jest.fn().mockResolvedValue(consultation),
    });
    triageSessionModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue({
        specialty: Specialty.GENERAL_MEDICINE,
        answers: [
          {
            questionText: 'Sintoma',
            answerValue: ['tos', 'fiebre'],
          },
        ],
        analysis: {
          priority: 'HIGH',
          redFlags: [],
          aiSummary: 'Resumen previo',
        },
      }),
    });
    patientModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue({
        birthDate: new Date('1990-01-01T00:00:00.000Z'),
        gender: 'FEMALE',
        heightCm: 165,
        weightKg: 62,
      }),
    });
    aiService.generateText.mockResolvedValue({
      text: '**Resumen Clínico para Médico Evaluador:** Resumen clínico final',
    });

    const result = await service.generateSummary(
      consultationId.toString(),
      buildRequestUser({
        userId: doctorId.toString(),
        role: UserRole.DOCTOR,
        email: 'doctor@test.com',
      }),
    );

    expect(aiService.generateText).toHaveBeenCalled();
    const [generateTextRequest] = aiService.generateText.mock.calls[0] as [
      { inputText: string },
    ];
    expect(generateTextRequest.inputText).toContain('Género: FEMALE');
    expect(generateTextRequest.inputText).toContain('Altura: 165 cm');
    expect(generateTextRequest.inputText).toContain('Peso: 62 kg');
    expect(result.summary).toBe('Resumen clínico final');
  });

  it('falls back to local summary generation when AI fails', async () => {
    const consultationId = new Types.ObjectId();
    const doctorId = new Types.ObjectId();
    const triageSessionId = new Types.ObjectId();
    const consultation = {
      id: consultationId.toString(),
      assignedDoctorId: doctorId,
      triageSessionId,
      priority: 'LOW',
      save: jest.fn(),
      clinicalSummary: '',
    };
    consultationModel.findById.mockReturnValueOnce({
      exec: jest.fn().mockResolvedValue(consultation),
    });
    triageSessionModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue({
        specialty: Specialty.ODONTOLOGY,
        answers: [
          {
            questionText: 'Motivo',
            answerValue: 'dolor dental',
          },
        ],
        analysis: {
          priority: 'LOW',
          redFlags: [],
          aiSummary: 'Paciente estable',
        },
      }),
    });
    aiService.generateText.mockRejectedValue(new Error('gemini down'));

    const result = await service.generateSummary(
      consultationId.toString(),
      buildRequestUser({
        userId: doctorId.toString(),
        role: UserRole.DOCTOR,
        email: 'doctor@test.com',
      }),
    );

    expect(result.summary).toContain('Especialidad: ODONTOLOGY');
    expect(result.summary).toContain('Resumen IA: Paciente estable');
  });

  it('delegates chat retrieval to chat service', async () => {
    chatService.getMessages.mockResolvedValue({ items: [], total: 0 });
    const user = buildRequestUser({
      userId: new Types.ObjectId().toString(),
      role: UserRole.ADMIN,
      email: 'admin@test.com',
    });

    await expect(
      service.getMessages(new Types.ObjectId().toString(), user, 25),
    ).resolves.toEqual({ items: [], total: 0 });
    expect(chatService.getMessages).toHaveBeenCalledWith(
      expect.any(String),
      user,
      25,
    );
  });

  it('rates a closed consultation owned by the patient', async () => {
    const consultationId = new Types.ObjectId();
    const patientId = new Types.ObjectId();
    const consultation = {
      id: consultationId.toString(),
      patientId,
      status: 'CLOSED',
      save: jest.fn(),
      rating: undefined as number | undefined,
      ratingComment: undefined as string | undefined,
    };
    consultationModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(consultation),
    });

    const result = await service.rate(
      consultationId.toString(),
      buildRequestUser({
        userId: patientId.toString(),
        role: UserRole.PATIENT,
        email: 'patient@test.com',
      }),
      { rating: 5, ratingComment: 'Excelente' },
    );

    expect(consultation.save).toHaveBeenCalled();
    expect(result).toEqual({
      id: consultationId.toString(),
      rating: 5,
      ratingComment: 'Excelente',
    });
  });

  it('returns paginated doctor history', async () => {
    const doctorId = new Types.ObjectId();
    consultationModel.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([
        {
          _id: new Types.ObjectId(),
          patientId: new Types.ObjectId(),
          specialty: Specialty.GENERAL_MEDICINE,
          priority: 'HIGH',
          status: 'CLOSED',
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          closedAt: new Date('2025-01-02T00:00:00.000Z'),
        },
      ]),
    });
    consultationModel.countDocuments.mockResolvedValue(1);

    const result = await service.getDoctorHistory(
      buildRequestUser({
        userId: doctorId.toString(),
        role: UserRole.DOCTOR,
        email: 'doctor@test.com',
      }),
      { page: 2, limit: 1, status: 'CLOSED' },
    );

    expect(result.total).toBe(1);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(1);
  });

  it('creates a followup escalation consultation', async () => {
    const patientId = new Types.ObjectId();
    const triageSessionId = new Types.ObjectId();
    const sourceFollowupId = new Types.ObjectId();
    const consultation = { id: 'c-escalated' };
    consultationModel.create.mockResolvedValue([consultation]);

    const result = await service.createFollowupEscalationConsultation({
      patientId,
      triageSessionId,
      specialty: Specialty.ODONTOLOGY,
      priority: 'HIGH',
      sourceFollowupId,
    });

    expect(consultationModel.create).toHaveBeenCalledWith([
      expect.objectContaining({
        patientId,
        triageSessionId,
        specialty: Specialty.ODONTOLOGY,
        priority: 'HIGH',
        sourceFollowupId,
      }),
    ]);
    expect(result).toBe(consultation);
  });

  it('assign rejects invalid doctor ids', async () => {
    try {
      await service.assign(
        'consultation-1',
        buildRequestUser({
          userId: 'invalid-id',
          role: UserRole.DOCTOR,
          email: 'doctor@test.com',
        }),
      );
      fail('Expected assign to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
    }
  });

  it('assign rejects paused doctors', async () => {
    doctorModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue({
        doctorStatus: 'VERIFIED',
        availabilityStatus: 'PAUSED',
        specialty: Specialty.GENERAL_MEDICINE,
      }),
    });

    await expect(
      service.assign(
        new Types.ObjectId().toString(),
        buildRequestUser({
          userId: new Types.ObjectId().toString(),
          role: UserRole.DOCTOR,
          email: 'doctor@test.com',
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('assign rejects missing consultations', async () => {
    doctorModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue({
        doctorStatus: 'VERIFIED',
        availabilityStatus: 'AVAILABLE',
        specialty: Specialty.GENERAL_MEDICINE,
      }),
    });
    consultationModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });
    consultationModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(null),
    });

    await expect(
      service.assign(
        new Types.ObjectId().toString(),
        buildRequestUser({
          userId: new Types.ObjectId().toString(),
          role: UserRole.DOCTOR,
          email: 'doctor@test.com',
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assign rejects consultations that are not pending with a conflict', async () => {
    doctorModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue({
        doctorStatus: 'VERIFIED',
        availabilityStatus: 'AVAILABLE',
        specialty: Specialty.GENERAL_MEDICINE,
      }),
    });
    consultationModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });
    consultationModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue({
        status: 'IN_ATTENTION',
      }),
    });

    await expect(
      service.assign(
        new Types.ObjectId().toString(),
        buildRequestUser({
          userId: new Types.ObjectId().toString(),
          role: UserRole.DOCTOR,
          email: 'doctor@test.com',
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('assign rejects pending consultations outside doctor specialty', async () => {
    doctorModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue({
        doctorStatus: 'VERIFIED',
        availabilityStatus: 'AVAILABLE',
        specialty: Specialty.GENERAL_MEDICINE,
      }),
    });
    consultationModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });
    consultationModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue({
        status: 'PENDING',
        specialty: Specialty.ODONTOLOGY,
      }),
    });

    await expect(
      service.assign(
        new Types.ObjectId().toString(),
        buildRequestUser({
          userId: new Types.ObjectId().toString(),
          role: UserRole.DOCTOR,
          email: 'doctor@test.com',
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('close rejects consultations that are not in attention', async () => {
    const doctorId = new Types.ObjectId();
    consultationModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        assignedDoctorId: doctorId,
        status: 'PENDING',
      }),
    });

    await expect(
      service.close(
        new Types.ObjectId().toString(),
        buildRequestUser({
          userId: doctorId.toString(),
          role: UserRole.DOCTOR,
          email: 'doctor@test.com',
        }),
        {
          baselineSymptomSeverity: 2,
          redFlagsConfirmed: false,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('generateSummary rejects when the triage session is missing', async () => {
    const doctorId = new Types.ObjectId();
    consultationModel.findById.mockReturnValueOnce({
      exec: jest.fn().mockResolvedValue({
        assignedDoctorId: doctorId,
        triageSessionId: new Types.ObjectId(),
      }),
    });
    triageSessionModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(null),
    });

    await expect(
      service.generateSummary(
        new Types.ObjectId().toString(),
        buildRequestUser({
          userId: doctorId.toString(),
          role: UserRole.DOCTOR,
          email: 'doctor@test.com',
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('generateSummary builds a minimal fallback summary when AI fails and there are no answers', async () => {
    const doctorId = new Types.ObjectId();
    consultationModel.findById.mockReturnValueOnce({
      exec: jest.fn().mockResolvedValue({
        id: 'c1',
        assignedDoctorId: doctorId,
        triageSessionId: new Types.ObjectId(),
        priority: 'LOW',
        save: jest.fn(),
        clinicalSummary: '',
      }),
    });
    triageSessionModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue({
        specialty: Specialty.GENERAL_MEDICINE,
        answers: [],
        analysis: null,
      }),
    });
    aiService.generateText.mockRejectedValue(new Error('gemini down'));

    const result = await service.generateSummary(
      new Types.ObjectId().toString(),
      buildRequestUser({
        userId: doctorId.toString(),
        role: UserRole.DOCTOR,
        email: 'doctor@test.com',
      }),
    );

    expect(result.summary).toContain('Especialidad: GENERAL_MEDICINE');
    expect(result.summary).toContain('Prioridad: LOW');
  });

  it('submitSummaryFeedback persists doctor feedback', async () => {
    const doctorId = new Types.ObjectId();
    const consultation = {
      id: 'c1',
      assignedDoctorId: doctorId,
      save: jest.fn(),
      summaryFeedback: undefined as
        | {
            value: string;
            comment?: string;
          }
        | undefined,
    };
    consultationModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(consultation),
    });

    const result = await service.submitSummaryFeedback(
      'c1',
      buildRequestUser({
        userId: doctorId.toString(),
        role: UserRole.DOCTOR,
        email: 'doctor@test.com',
      }),
      { value: 'USEFUL', comment: 'Buen resumen' },
    );

    expect(consultation.save).toHaveBeenCalled();
    expect(result).toEqual({
      id: 'c1',
      summaryFeedback: {
        value: 'USEFUL',
        comment: 'Buen resumen',
      },
    });
  });

  it('rate rejects consultations that are not owned by the patient', async () => {
    consultationModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        patientId: new Types.ObjectId(),
      }),
    });

    await expect(
      service.rate(
        'c1',
        buildRequestUser({
          userId: new Types.ObjectId().toString(),
          role: UserRole.PATIENT,
          email: 'patient@test.com',
        }),
        { rating: 4 },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rate rejects consultations that are not closed', async () => {
    const patientId = new Types.ObjectId();
    consultationModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        patientId,
        status: 'IN_ATTENTION',
      }),
    });

    await expect(
      service.rate(
        'c1',
        buildRequestUser({
          userId: patientId.toString(),
          role: UserRole.PATIENT,
          email: 'patient@test.com',
        }),
        { rating: 4 },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rate rejects already rated consultations', async () => {
    const patientId = new Types.ObjectId();
    consultationModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        patientId,
        status: 'CLOSED',
        rating: 5,
      }),
    });

    await expect(
      service.rate(
        'c1',
        buildRequestUser({
          userId: patientId.toString(),
          role: UserRole.PATIENT,
          email: 'patient@test.com',
        }),
        { rating: 4 },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('getPatientHistory returns default pagination when no query values are provided', async () => {
    consultationModel.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    });
    consultationModel.countDocuments.mockResolvedValue(0);
    const patientId = new Types.ObjectId();

    const result = await service.getPatientHistory(
      buildRequestUser({
        userId: patientId.toString(),
        role: UserRole.PATIENT,
        email: 'patient@test.com',
      }),
      {},
    );

    expect(result).toEqual({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });
  });

  it('getById allows admin access to any consultation', async () => {
    const consultationId = new Types.ObjectId();
    const triageSessionId = new Types.ObjectId();
    consultationModel.findById.mockReturnValueOnce({
      exec: jest.fn().mockResolvedValue({
        _id: consultationId,
        patientId: new Types.ObjectId(),
        triageSessionId,
        specialty: Specialty.GENERAL_MEDICINE,
        priority: 'LOW',
        status: 'PENDING',
      }),
    });
    triageSessionModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(null),
    });

    const result = await service.getById(
      consultationId.toString(),
      buildRequestUser({
        userId: new Types.ObjectId().toString(),
        role: UserRole.ADMIN,
        email: 'admin@test.com',
      }),
    );

    expect(result.id).toBe(consultationId.toString());
    expect(result.triage).toBeNull();
  });

  it('getById rejects invalid consultation ids', async () => {
    await expect(
      service.getById(
        'invalid-id',
        buildRequestUser({
          userId: new Types.ObjectId().toString(),
          role: UserRole.ADMIN,
          email: 'admin@test.com',
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('findByIdUnsafe delegates directly to the model', async () => {
    const consultation = { id: 'c1' };
    consultationModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(consultation),
    });

    await expect(service.findByIdUnsafe('c1')).resolves.toBe(consultation);
  });
});
