import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { ClientSession, Types } from 'mongoose';
import { Specialty } from '../common/enums/specialty.enum';
import { AiService } from '../ai/ai.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Patient } from '../patients/schemas/patient.schema';
import { ConsultationMessage } from '../chat/schemas/consultation-message.schema';
import { TriageSession } from '../triage/schemas/triage-session.schema';
import { ConsultationsService } from './consultations.service';
import { Consultation } from './schemas/consultation.schema';

// ── Consultation model ────────────────────────────────────────────────────────

const findExecMock = jest.fn();
const findChain = {
  select: jest.fn().mockReturnThis(),
  lean: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  exec: findExecMock,
};

const consultationFindByIdExecMock = jest.fn();
const consultationFindByIdChain = {
  select: jest.fn().mockReturnThis(),
  lean: jest.fn().mockReturnThis(),
  exec: consultationFindByIdExecMock,
};

const consultationModel = {
  create: jest.fn(),
  find: jest.fn().mockReturnValue(findChain),
  findById: jest.fn().mockReturnValue(consultationFindByIdChain),
  countDocuments: jest.fn(),
};

// ── TriageSession model ───────────────────────────────────────────────────────

const triageExecMock = jest.fn();
const triageChain = {
  select: jest.fn().mockReturnThis(),
  lean: jest.fn().mockReturnThis(),
  exec: triageExecMock,
};
const triageSessionModel = {
  findById: jest.fn().mockReturnValue(triageChain),
};

// ── ConsultationMessage model ─────────────────────────────────────────────────

const messageExecMock = jest.fn();
const messageChain = {
  sort: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  lean: jest.fn().mockReturnThis(),
  exec: messageExecMock,
};
const messageModel = {
  find: jest.fn().mockReturnValue(messageChain),
};

// ── Patient model ─────────────────────────────────────────────────────────────

const patientExecMock = jest.fn();
const patientChain = {
  select: jest.fn().mockReturnThis(),
  lean: jest.fn().mockReturnThis(),
  exec: patientExecMock,
};
const patientModel = {
  findById: jest.fn().mockReturnValue(patientChain),
};

// ── AiService / NotificationsService mocks ───────────────────────────────────

const aiServiceMock = { generateText: jest.fn() };
const notificationsServiceMock = { sendExpoPush: jest.fn() };

// ─────────────────────────────────────────────────────────────────────────────

describe('ConsultationsService', () => {
  let service: ConsultationsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    findExecMock.mockResolvedValue([]);
    consultationFindByIdExecMock.mockResolvedValue(null);
    triageExecMock.mockResolvedValue(null);
    messageExecMock.mockResolvedValue([]);
    patientExecMock.mockResolvedValue(null);

    consultationModel.find.mockReturnValue(findChain);
    consultationModel.findById.mockReturnValue(consultationFindByIdChain);
    consultationModel.countDocuments.mockReturnValue({
      exec: jest.fn().mockResolvedValue(0),
    });
    triageSessionModel.findById.mockReturnValue(triageChain);
    messageModel.find.mockReturnValue(messageChain);
    patientModel.findById.mockReturnValue(patientChain);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConsultationsService,
        {
          provide: getModelToken(Consultation.name),
          useValue: consultationModel,
        },
        {
          provide: getModelToken(TriageSession.name),
          useValue: triageSessionModel,
        },
        {
          provide: getModelToken(ConsultationMessage.name),
          useValue: messageModel,
        },
        {
          provide: getModelToken(Patient.name),
          useValue: patientModel,
        },
        { provide: AiService, useValue: aiServiceMock },
        { provide: NotificationsService, useValue: notificationsServiceMock },
      ],
    }).compile();

    service = module.get<ConsultationsService>(ConsultationsService);
  });

  // ── createFromTriage ────────────────────────────────────────────────────────

  it('creates consultation using string ids without session', async () => {
    const newId = new Types.ObjectId();
    consultationModel.create.mockResolvedValue([{ _id: newId }]);

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

  // ── getQueue ────────────────────────────────────────────────────────────────

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

  // ── getById ─────────────────────────────────────────────────────────────────

  describe('getById', () => {
    it('throws NotFoundException when consultation not found', async () => {
      await expect(service.getById('cid', 'did')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when assigned to another doctor', async () => {
      const assignedId = new Types.ObjectId();
      consultationFindByIdExecMock.mockResolvedValue({
        _id: new Types.ObjectId(),
        patientId: new Types.ObjectId(),
        triageSessionId: new Types.ObjectId(),
        specialty: Specialty.GENERAL_MEDICINE,
        priority: 'HIGH',
        status: 'IN_ATTENTION',
        assignedDoctorId: assignedId,
      });
      await expect(service.getById('cid', 'different-id')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('returns consultation with triage session', async () => {
      const consultationId = new Types.ObjectId();
      const doctorId = new Types.ObjectId();
      consultationFindByIdExecMock.mockResolvedValue({
        _id: consultationId,
        patientId: new Types.ObjectId(),
        triageSessionId: new Types.ObjectId(),
        specialty: Specialty.GENERAL_MEDICINE,
        priority: 'HIGH',
        status: 'IN_ATTENTION',
        assignedDoctorId: doctorId,
        clinicalSummary: 'summary',
      });
      triageExecMock.mockResolvedValue({
        status: 'COMPLETED',
        answers: [
          { questionId: 'q1', questionText: 'Pain?', answerValue: '8' },
        ],
        analysis: { priority: 'HIGH', redFlags: [] },
      });

      const result = await service.getById('cid', doctorId.toString());
      expect(result.id).toBe(consultationId.toString());
      expect(result.triage).not.toBeNull();
      expect(result.clinicalSummary).toBe('summary');
    });

    it('returns null triage when triage session not found', async () => {
      consultationFindByIdExecMock.mockResolvedValue({
        _id: new Types.ObjectId(),
        patientId: new Types.ObjectId(),
        triageSessionId: new Types.ObjectId(),
        specialty: Specialty.GENERAL_MEDICINE,
        priority: 'LOW',
        status: 'PENDING',
      });

      const result = await service.getById('cid', 'any-doctor');
      expect(result.triage).toBeNull();
    });

    it('allows access when consultation is unassigned', async () => {
      consultationFindByIdExecMock.mockResolvedValue({
        _id: new Types.ObjectId(),
        patientId: new Types.ObjectId(),
        triageSessionId: new Types.ObjectId(),
        specialty: Specialty.GENERAL_MEDICINE,
        priority: 'LOW',
        status: 'PENDING',
      });

      await expect(service.getById('cid', 'any-doctor')).resolves.not.toThrow();
    });
  });

  // ── assign ──────────────────────────────────────────────────────────────────

  describe('assign', () => {
    it('throws NotFoundException when consultation not found', async () => {
      await expect(service.assign('cid', 'did')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ConflictException when consultation is not PENDING', async () => {
      consultationFindByIdExecMock.mockResolvedValue({
        status: 'IN_ATTENTION',
        save: jest.fn(),
      });
      await expect(service.assign('cid', 'did')).rejects.toThrow(
        ConflictException,
      );
    });

    it('assigns consultation to doctor and returns updated data', async () => {
      const consultationId = new Types.ObjectId();
      const doctorId = new Types.ObjectId();
      const saveMock = jest.fn().mockResolvedValue(undefined);
      consultationFindByIdExecMock.mockResolvedValue({
        _id: consultationId,
        status: 'PENDING',
        patientId: new Types.ObjectId(),
        save: saveMock,
      });

      const result = await service.assign(
        consultationId.toString(),
        doctorId.toString(),
      );

      expect(saveMock).toHaveBeenCalled();
      expect(result.status).toBe('IN_ATTENTION');
      expect(result.assignedDoctorId).toBe(doctorId.toString());
    });
  });

  // ── generateSummary ─────────────────────────────────────────────────────────

  describe('generateSummary', () => {
    it('throws NotFoundException when consultation not found', async () => {
      await expect(service.generateSummary('cid', 'did')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when caller is not the assigned doctor', async () => {
      const otherId = new Types.ObjectId();
      consultationFindByIdExecMock.mockResolvedValue({
        assignedDoctorId: otherId,
        save: jest.fn(),
      });
      await expect(service.generateSummary('cid', 'different')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws NotFoundException when triage session not found', async () => {
      const doctorId = new Types.ObjectId();
      consultationFindByIdExecMock.mockResolvedValue({
        assignedDoctorId: doctorId,
        triageSessionId: new Types.ObjectId(),
        save: jest.fn(),
      });
      await expect(
        service.generateSummary('cid', doctorId.toString()),
      ).rejects.toThrow(NotFoundException);
    });

    it('generates summary with red flags', async () => {
      const doctorId = new Types.ObjectId();
      const saveMock = jest.fn().mockResolvedValue(undefined);
      consultationFindByIdExecMock.mockResolvedValue({
        assignedDoctorId: doctorId,
        triageSessionId: new Types.ObjectId(),
        save: saveMock,
      });
      triageExecMock.mockResolvedValue({
        specialty: Specialty.GENERAL_MEDICINE,
        answers: [
          { questionId: 'q1', questionText: 'Pain level?', answerValue: '8' },
        ],
        analysis: {
          priority: 'HIGH',
          redFlags: [{ severity: 'HIGH', evidence: 'chest pain' }],
        },
      });
      aiServiceMock.generateText.mockResolvedValue({
        text: 'Clinical summary',
      });

      const result = await service.generateSummary('cid', doctorId.toString());

      expect(result.summary).toBe('Clinical summary');
      expect(saveMock).toHaveBeenCalled();
    });

    it('generates summary without red flags and trims whitespace', async () => {
      const doctorId = new Types.ObjectId();
      consultationFindByIdExecMock.mockResolvedValue({
        assignedDoctorId: doctorId,
        triageSessionId: new Types.ObjectId(),
        save: jest.fn().mockResolvedValue(undefined),
      });
      triageExecMock.mockResolvedValue({
        specialty: Specialty.GENERAL_MEDICINE,
        answers: [],
        analysis: { priority: 'LOW', redFlags: [] },
      });
      aiServiceMock.generateText.mockResolvedValue({ text: '  trimmed  ' });

      const result = await service.generateSummary('cid', doctorId.toString());

      expect(result.summary).toBe('trimmed');
    });

    it('uses SIN ANALIZAR when analysis is null and returns empty summary when text is null', async () => {
      const doctorId = new Types.ObjectId();
      consultationFindByIdExecMock.mockResolvedValue({
        assignedDoctorId: doctorId,
        triageSessionId: new Types.ObjectId(),
        save: jest.fn().mockResolvedValue(undefined),
      });
      triageExecMock.mockResolvedValue({
        specialty: Specialty.GENERAL_MEDICINE,
        answers: [],
        analysis: null,
      });
      aiServiceMock.generateText.mockResolvedValue({ text: null });

      const result = await service.generateSummary('cid', doctorId.toString());

      expect(result.summary).toBe('');
    });

    it('throws ServiceUnavailableException when AI call fails', async () => {
      const doctorId = new Types.ObjectId();
      consultationFindByIdExecMock.mockResolvedValue({
        assignedDoctorId: doctorId,
        triageSessionId: new Types.ObjectId(),
        save: jest.fn(),
      });
      triageExecMock.mockResolvedValue({
        specialty: Specialty.GENERAL_MEDICINE,
        answers: [],
        analysis: null,
      });
      aiServiceMock.generateText.mockRejectedValue(new Error('AI error'));

      await expect(
        service.generateSummary('cid', doctorId.toString()),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  // ── close ───────────────────────────────────────────────────────────────────

  describe('close', () => {
    it('throws NotFoundException when consultation not found', async () => {
      await expect(service.close('cid', 'did')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when caller is not the assigned doctor', async () => {
      const otherId = new Types.ObjectId();
      consultationFindByIdExecMock.mockResolvedValue({
        assignedDoctorId: otherId,
        save: jest.fn(),
      });
      await expect(service.close('cid', 'different')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws ConflictException when status is not IN_ATTENTION', async () => {
      const doctorId = new Types.ObjectId();
      consultationFindByIdExecMock.mockResolvedValue({
        assignedDoctorId: doctorId,
        status: 'PENDING',
        save: jest.fn(),
      });
      await expect(service.close('cid', doctorId.toString())).rejects.toThrow(
        ConflictException,
      );
    });

    it('closes consultation successfully', async () => {
      const doctorId = new Types.ObjectId();
      const consultationId = new Types.ObjectId();
      const saveMock = jest.fn().mockResolvedValue(undefined);
      consultationFindByIdExecMock.mockResolvedValue({
        _id: consultationId,
        assignedDoctorId: doctorId,
        status: 'IN_ATTENTION',
        patientId: new Types.ObjectId(),
        save: saveMock,
      });

      const result = await service.close(
        consultationId.toString(),
        doctorId.toString(),
      );

      expect(saveMock).toHaveBeenCalled();
      expect(result.status).toBe('CLOSED');
    });
  });

  // ── rateConsultation ────────────────────────────────────────────────────────

  describe('rateConsultation', () => {
    it('throws NotFoundException when consultation not found', async () => {
      await expect(
        service.rateConsultation('cid', 'pid', { rating: 5 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when patient mismatch', async () => {
      const patientId = new Types.ObjectId();
      consultationFindByIdExecMock.mockResolvedValue({
        patientId,
        status: 'CLOSED',
        save: jest.fn(),
      });
      await expect(
        service.rateConsultation('cid', 'different', { rating: 5 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when consultation is not CLOSED', async () => {
      const patientId = new Types.ObjectId();
      consultationFindByIdExecMock.mockResolvedValue({
        patientId,
        status: 'IN_ATTENTION',
        save: jest.fn(),
      });
      await expect(
        service.rateConsultation('cid', patientId.toString(), { rating: 5 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when already rated', async () => {
      const patientId = new Types.ObjectId();
      consultationFindByIdExecMock.mockResolvedValue({
        patientId,
        status: 'CLOSED',
        rating: 4,
        save: jest.fn(),
      });
      await expect(
        service.rateConsultation('cid', patientId.toString(), { rating: 5 }),
      ).rejects.toThrow(ConflictException);
    });

    it('saves rating with comment', async () => {
      const patientId = new Types.ObjectId();
      const consultationId = new Types.ObjectId();
      const saveMock = jest.fn().mockResolvedValue(undefined);
      consultationFindByIdExecMock.mockResolvedValue({
        _id: consultationId,
        patientId,
        status: 'CLOSED',
        rating: undefined,
        save: saveMock,
      });

      const result = await service.rateConsultation(
        'cid',
        patientId.toString(),
        {
          rating: 5,
          ratingComment: 'Excellent',
        },
      );

      expect(saveMock).toHaveBeenCalled();
      expect(result.rating).toBe(5);
      expect(result.ratingComment).toBe('Excellent');
    });

    it('saves rating without comment', async () => {
      const patientId = new Types.ObjectId();
      const saveMock = jest.fn().mockResolvedValue(undefined);
      consultationFindByIdExecMock.mockResolvedValue({
        _id: new Types.ObjectId(),
        patientId,
        status: 'CLOSED',
        rating: undefined,
        save: saveMock,
      });

      const result = await service.rateConsultation(
        'cid',
        patientId.toString(),
        { rating: 3 },
      );

      expect(result.rating).toBe(3);
      expect(result.ratingComment).toBeUndefined();
    });
  });

  // ── getMessages ─────────────────────────────────────────────────────────────

  describe('getMessages', () => {
    it('throws NotFoundException when consultation not found', async () => {
      await expect(service.getMessages('cid', 'did')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when assigned to another doctor', async () => {
      const assignedId = new Types.ObjectId();
      consultationFindByIdExecMock.mockResolvedValue({
        assignedDoctorId: assignedId,
      });
      await expect(service.getMessages('cid', 'other-doctor')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('returns messages in reverse-chronological then reversed order', async () => {
      const cId = new Types.ObjectId();
      consultationFindByIdExecMock.mockResolvedValue({ _id: cId });
      const msgId = new Types.ObjectId();
      messageExecMock.mockResolvedValue([
        {
          _id: msgId,
          consultationId: cId,
          senderId: new Types.ObjectId(),
          senderRole: 'DOCTOR',
          content: 'Hello',
          type: 'TEXT',
          createdAt: new Date(),
        },
      ]);

      const result = await service.getMessages(cId.toString(), 'any-doctor');

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.items[0].content).toBe('Hello');
    });

    it('allows access to unassigned consultation', async () => {
      const validId = new Types.ObjectId();
      consultationFindByIdExecMock.mockResolvedValue({ _id: validId });

      await expect(
        service.getMessages(validId.toString(), 'any-doctor'),
      ).resolves.not.toThrow();
    });
  });

  // ── getPatientHistory ───────────────────────────────────────────────────────

  describe('getPatientHistory', () => {
    it('returns paginated history without status filter', async () => {
      const patientId = new Types.ObjectId().toString();
      const result = await service.getPatientHistory(patientId);

      expect(consultationModel.find).toHaveBeenCalledWith(
        expect.not.objectContaining({ status: expect.anything() }),
      );
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('applies status filter when provided', async () => {
      const patientId = new Types.ObjectId().toString();
      await service.getPatientHistory(patientId, { status: 'CLOSED' });

      expect(consultationModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'CLOSED' }),
      );
    });

    it('clamps page to 1 and limit to 50', async () => {
      const patientId = new Types.ObjectId().toString();
      const result = await service.getPatientHistory(patientId, {
        page: 0,
        limit: 999,
      });

      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });

    it('maps history items correctly', async () => {
      const patientId = new Types.ObjectId().toString();
      const consultationId = new Types.ObjectId();
      findExecMock.mockResolvedValue([
        {
          _id: consultationId,
          specialty: Specialty.GENERAL_MEDICINE,
          priority: 'LOW',
          status: 'CLOSED',
          clinicalSummary: 'summary',
          rating: 5,
          ratingComment: 'Good',
          createdAt: new Date('2026-01-01'),
          closedAt: new Date('2026-01-02'),
        },
      ]);

      const result = await service.getPatientHistory(patientId);

      expect(result.items[0].id).toBe(consultationId.toString());
      expect(result.items[0].rating).toBe(5);
      expect(result.items[0].ratingComment).toBe('Good');
    });
  });

  // ── getDoctorHistory ────────────────────────────────────────────────────────

  describe('getDoctorHistory', () => {
    it('returns paginated history without status filter', async () => {
      const doctorId = new Types.ObjectId().toString();
      const result = await service.getDoctorHistory(doctorId);

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('applies status filter when provided', async () => {
      const doctorId = new Types.ObjectId().toString();
      await service.getDoctorHistory(doctorId, { status: 'CLOSED' });

      expect(consultationModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'CLOSED' }),
      );
    });

    it('maps history items correctly including patientId', async () => {
      const doctorId = new Types.ObjectId().toString();
      const consultationId = new Types.ObjectId();
      const patientId = new Types.ObjectId();
      findExecMock.mockResolvedValue([
        {
          _id: consultationId,
          patientId,
          specialty: Specialty.GENERAL_MEDICINE,
          priority: 'HIGH',
          status: 'CLOSED',
          clinicalSummary: 'summary',
          createdAt: new Date(),
          closedAt: new Date(),
        },
      ]);

      const result = await service.getDoctorHistory(doctorId);

      expect(result.items[0].patientId).toBe(patientId.toString());
      expect(result.items[0].id).toBe(consultationId.toString());
    });
  });

  // ── notifyPatient (side effect via assign / close) ──────────────────────────

  describe('notifyPatient', () => {
    it('sends push notification when patient has expoPushToken', async () => {
      const doctorId = new Types.ObjectId();
      consultationFindByIdExecMock.mockResolvedValue({
        _id: new Types.ObjectId(),
        status: 'PENDING',
        patientId: new Types.ObjectId(),
        save: jest.fn().mockResolvedValue(undefined),
      });
      patientExecMock.mockResolvedValue({
        expoPushToken: 'ExponentPushToken[test]',
      });

      await service.assign('cid', doctorId.toString());
      await new Promise((r) => setImmediate(r));

      expect(notificationsServiceMock.sendExpoPush).toHaveBeenCalledWith(
        'ExponentPushToken[test]',
        expect.any(String),
        expect.any(String),
      );
    });

    it('does not send push notification when patient has no expoPushToken', async () => {
      const doctorId = new Types.ObjectId();
      consultationFindByIdExecMock.mockResolvedValue({
        _id: new Types.ObjectId(),
        status: 'PENDING',
        patientId: new Types.ObjectId(),
        save: jest.fn().mockResolvedValue(undefined),
      });
      patientExecMock.mockResolvedValue({ expoPushToken: null });

      await service.assign('cid', doctorId.toString());
      await new Promise((r) => setImmediate(r));

      expect(notificationsServiceMock.sendExpoPush).not.toHaveBeenCalled();
    });
  });
});
