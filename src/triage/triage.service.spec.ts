import {
  BadRequestException,
  ConflictException,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { ConsultationsService } from '../consultations/consultations.service';
import { Specialty } from '../common/enums/specialty.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { RedFlagsEngine } from './engines/red-flags.engine';
import { TriageQuestionsRepository } from './questions/triage-questions.repository';
import { GeminiTriageService } from './services/gemini-triage.service';
import { GuardrailService } from './services/guardrail.service';
import { TriageSession } from './schemas/triage-session.schema';
import { TriageService } from './triage.service';

function createFindOneChain(result: unknown) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(result),
  };
}

describe('TriageService', () => {
  let service: TriageService;

  const triageSessionModel = {
    findOne: jest.fn(),
    create: jest.fn(),
  };

  const triageQuestionsRepository = {
    getQuestionsBySpecialty: jest.fn(),
    isQuestionValid: jest.fn(),
    getQuestionById: jest.fn(),
    getRequiredQuestionIds: jest.fn(),
  };

  const geminiTriageService = {
    analyzeTriage: jest.fn(),
  };

  const guardrailService = {
    check: jest.fn(),
  };

  const consultationsService = {
    createFromTriage: jest.fn(),
  };

  beforeEach(async () => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    guardrailService.check.mockReturnValue({ safe: true, violations: [] });
    jest.spyOn(RedFlagsEngine, 'evaluate').mockReturnValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TriageService,
        {
          provide: getModelToken(TriageSession.name),
          useValue: triageSessionModel,
        },
        {
          provide: TriageQuestionsRepository,
          useValue: triageQuestionsRepository,
        },
        {
          provide: GeminiTriageService,
          useValue: geminiTriageService,
        },
        {
          provide: GuardrailService,
          useValue: guardrailService,
        },
        {
          provide: ConsultationsService,
          useValue: consultationsService,
        },
      ],
    }).compile();

    service = module.get<TriageService>(TriageService);
  });

  it('should throw 400 when patient id is invalid', async () => {
    await expect(
      service.createSession(
        {
          userId: 'invalid',
          email: 'patient@example.com',
          role: UserRole.PATIENT,
          isActive: true,
        },
        { specialty: Specialty.GENERAL_MEDICINE },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should throw 409 when there is an active session for patient and specialty', async () => {
    triageSessionModel.findOne.mockReturnValue(
      createFindOneChain({ _id: new Types.ObjectId() }),
    );

    await expect(
      service.createSession(
        {
          userId: new Types.ObjectId().toString(),
          email: 'patient@example.com',
          role: UserRole.PATIENT,
          isActive: true,
        },
        { specialty: Specialty.GENERAL_MEDICINE },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('should create a new triage session and return questions', async () => {
    const sessionId = new Types.ObjectId();
    triageSessionModel.findOne.mockReturnValue(createFindOneChain(null));
    triageSessionModel.create.mockResolvedValue([
      {
        _id: sessionId,
        specialty: Specialty.GENERAL_MEDICINE,
        status: 'IN_PROGRESS',
      },
    ]);
    triageQuestionsRepository.getQuestionsBySpecialty.mockReturnValue([
      { questionId: 'MG-Q1', questionText: 'Q1' },
    ]);
    triageQuestionsRepository.getRequiredQuestionIds.mockReturnValue([
      'MG-Q1',
      'MG-Q2',
    ]);

    const result = await service.createSession(
      {
        userId: new Types.ObjectId().toString(),
        email: 'patient@example.com',
        role: UserRole.PATIENT,
        isActive: true,
      },
      { specialty: Specialty.GENERAL_MEDICINE },
      'corr-1',
    );

    expect(result).toEqual({
      sessionId: sessionId.toString(),
      specialty: Specialty.GENERAL_MEDICINE,
      status: 'IN_PROGRESS',
      questions: [{ questionId: 'MG-Q1', questionText: 'Q1' }],
      totalQuestions: 2,
      answeredCount: 0,
      remainingQuestions: 2,
      progressPercent: 0,
      nextQuestionId: 'MG-Q1',
      isComplete: false,
    });
    expect(
      triageQuestionsRepository.getQuestionsBySpecialty,
    ).toHaveBeenCalledWith(Specialty.GENERAL_MEDICINE);
  });

  it('should throw 404 when session does not exist or does not belong to patient', async () => {
    triageSessionModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });

    await expect(
      service.saveAnswers(
        new Types.ObjectId().toString(),
        {
          userId: new Types.ObjectId().toString(),
          email: 'patient@example.com',
          role: UserRole.PATIENT,
          isActive: true,
        },
        { answers: [{ questionId: 'MG-Q1', answerValue: 'si' }] },
      ),
    ).rejects.toThrow('Sesion de triage no encontrada');
  });

  it('should throw 400 when session status is not IN_PROGRESS', async () => {
    triageSessionModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(),
        specialty: Specialty.GENERAL_MEDICINE,
        status: 'COMPLETED',
        answers: [],
        save: jest.fn(),
      }),
    });

    await expect(
      service.saveAnswers(
        new Types.ObjectId().toString(),
        {
          userId: new Types.ObjectId().toString(),
          email: 'patient@example.com',
          role: UserRole.PATIENT,
          isActive: true,
        },
        { answers: [{ questionId: 'MG-Q1', answerValue: 'si' }] },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should throw 400 when question ids are invalid for session specialty', async () => {
    triageSessionModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(),
        specialty: Specialty.GENERAL_MEDICINE,
        status: 'IN_PROGRESS',
        answers: [],
        save: jest.fn(),
      }),
    });
    triageQuestionsRepository.isQuestionValid.mockReturnValue(false);

    await expect(
      service.saveAnswers(
        new Types.ObjectId().toString(),
        {
          userId: new Types.ObjectId().toString(),
          email: 'patient@example.com',
          role: UserRole.PATIENT,
          isActive: true,
        },
        { answers: [{ questionId: 'OD-Q9', answerValue: 'si' }] },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should save partial answers and return isComplete false', async () => {
    const sessionId = new Types.ObjectId();
    const saveMock = jest.fn().mockResolvedValue(undefined);
    triageSessionModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: sessionId,
        specialty: Specialty.GENERAL_MEDICINE,
        status: 'IN_PROGRESS',
        answers: [],
        save: saveMock,
      }),
    });
    triageQuestionsRepository.isQuestionValid.mockReturnValue(true);
    triageQuestionsRepository.getQuestionById.mockReturnValue({
      questionId: 'MG-Q1',
      questionText: 'Q1',
    });
    triageQuestionsRepository.getRequiredQuestionIds.mockReturnValue([
      'MG-Q1',
      'MG-Q2',
    ]);

    const result = await service.saveAnswers(
      sessionId.toString(),
      {
        userId: new Types.ObjectId().toString(),
        email: 'patient@example.com',
        role: UserRole.PATIENT,
        isActive: true,
      },
      { answers: [{ questionId: 'MG-Q1', answerValue: 'si' }] },
    );

    expect(saveMock).toHaveBeenCalled();
    expect(result).toEqual({
      sessionId: sessionId.toString(),
      answersCount: 1,
      isComplete: false,
      totalQuestions: 2,
      answeredCount: 1,
      remainingQuestions: 1,
      progressPercent: 50,
      nextQuestionId: 'MG-Q2',
    });
  });

  it('should save answers and return isComplete true when all required questions are answered', async () => {
    const sessionId = new Types.ObjectId();
    const saveMock = jest.fn().mockResolvedValue(undefined);
    triageSessionModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: sessionId,
        specialty: Specialty.GENERAL_MEDICINE,
        status: 'IN_PROGRESS',
        answers: [],
        save: saveMock,
      }),
    });
    triageQuestionsRepository.isQuestionValid.mockReturnValue(true);
    triageQuestionsRepository.getQuestionById.mockImplementation(
      (_specialty: Specialty, questionId: string) => ({
        questionId,
        questionText: questionId,
      }),
    );
    triageQuestionsRepository.getRequiredQuestionIds.mockReturnValue([
      'MG-Q1',
      'MG-Q2',
    ]);

    const result = await service.saveAnswers(
      sessionId.toString(),
      {
        userId: new Types.ObjectId().toString(),
        email: 'patient@example.com',
        role: UserRole.PATIENT,
        isActive: true,
      },
      {
        answers: [
          { questionId: 'MG-Q1', answerValue: 'si' },
          { questionId: 'MG-Q2', answerValue: 'no' },
        ],
      },
    );

    expect(saveMock).toHaveBeenCalled();
    expect(result).toEqual({
      sessionId: sessionId.toString(),
      answersCount: 2,
      isComplete: true,
      totalQuestions: 2,
      answeredCount: 2,
      remainingQuestions: 0,
      progressPercent: 100,
      nextQuestionId: null,
    });
  });

  it('should throw 422 when trying to analyze an incomplete session', async () => {
    triageSessionModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(),
        patientId: new Types.ObjectId(),
        specialty: Specialty.GENERAL_MEDICINE,
        status: 'IN_PROGRESS',
        answers: [{ questionId: 'MG-Q1', answerValue: 'si' }],
        save: jest.fn(),
      }),
    });
    triageQuestionsRepository.getRequiredQuestionIds.mockReturnValue([
      'MG-Q1',
      'MG-Q2',
    ]);

    await expect(
      service.analyzeSession(
        new Types.ObjectId().toString(),
        {
          userId: new Types.ObjectId().toString(),
          email: 'patient@example.com',
          role: UserRole.PATIENT,
          isActive: true,
        },
        'corr-incomplete',
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('should apply guardrail and complete session successfully for general medicine', async () => {
    const sessionId = new Types.ObjectId();
    const patientId = new Types.ObjectId();
    const saveMock = jest.fn().mockResolvedValue(undefined);
    const triageSession: {
      _id: Types.ObjectId;
      patientId: Types.ObjectId;
      specialty: Specialty;
      status: string;
      answers: Array<{ questionId: string; answerValue: string }>;
      save: jest.Mock;
      analysis?: {
        guardrailApplied?: boolean;
        aiSummary?: string;
      };
      completedAt?: Date;
    } = {
      _id: sessionId,
      patientId,
      specialty: Specialty.GENERAL_MEDICINE,
      status: 'IN_PROGRESS',
      answers: [{ questionId: 'MG-Q1', answerValue: 'si' }],
      save: saveMock,
    };

    triageSessionModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(triageSession),
    });
    triageQuestionsRepository.getRequiredQuestionIds.mockReturnValue(['MG-Q1']);
    jest.spyOn(RedFlagsEngine, 'evaluate').mockReturnValue([]);
    geminiTriageService.analyzeTriage.mockResolvedValue({
      basePriority: 'LOW',
      aiSummary: 'Diagnostico probable de migraña con prescripcion sugerida',
    });
    guardrailService.check.mockReturnValue({
      safe: false,
      violations: ['diagnosis:diagnostico\\s+de'],
    });
    consultationsService.createFromTriage.mockResolvedValue(undefined);
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    const result = await service.analyzeSession(
      sessionId.toString(),
      {
        userId: patientId.toString(),
        email: 'patient@example.com',
        role: UserRole.PATIENT,
        isActive: true,
      },
      'corr-guardrail',
    );

    expect(result.priority).toBe('LOW');
    expect(result.highPriorityAlert).toBe(false);
    expect(triageSession.status).toBe('COMPLETED');
    expect(triageSession.analysis?.guardrailApplied).toBe(true);
    expect(triageSession.analysis?.aiSummary).toBeUndefined();
    expect(consultationsService.createFromTriage).toHaveBeenCalledWith({
      patientId,
      triageSessionId: sessionId,
      specialty: Specialty.GENERAL_MEDICINE,
      priority: 'LOW',
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const warnPayloadRaw = warnSpy.mock.calls[0][0] as string;
    const warnPayload = JSON.parse(warnPayloadRaw) as {
      correlation_id: string;
      violations: string[];
    };
    expect(warnPayload.correlation_id).toBe('corr-guardrail');
    expect(warnPayload.violations).toContain('diagnosis:diagnostico\\s+de');
  });

  it('should override priority to HIGH when any CRITICAL red flag exists', async () => {
    const sessionId = new Types.ObjectId();
    const patientId = new Types.ObjectId();
    const triageSession = {
      _id: sessionId,
      patientId,
      specialty: Specialty.ODONTOLOGY,
      status: 'IN_PROGRESS',
      answers: [{ questionId: 'OD-Q1', answerValue: 'dolor' }],
      save: jest.fn().mockResolvedValue(undefined),
      analysis: undefined,
      completedAt: undefined,
    };

    triageSessionModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(triageSession),
    });
    triageQuestionsRepository.getRequiredQuestionIds.mockReturnValue(['OD-Q1']);
    jest.spyOn(RedFlagsEngine, 'evaluate').mockReturnValue([
      {
        code: 'RF-OD-CRIT',
        specialty: Specialty.ODONTOLOGY,
        severity: 'CRITICAL',
        evidence: 'test',
      },
    ]);
    guardrailService.check.mockReturnValue({ safe: true, violations: [] });
    consultationsService.createFromTriage.mockResolvedValue(undefined);

    const result = await service.analyzeSession(sessionId.toString(), {
      userId: patientId.toString(),
      email: 'patient@example.com',
      role: UserRole.PATIENT,
      isActive: true,
    });

    expect(result.priority).toBe('HIGH');
    expect(result.highPriorityAlert).toBe(true);
  });

  it('should raise LOW base priority to MODERATE when WARNING red flags exist', async () => {
    const sessionId = new Types.ObjectId();
    const patientId = new Types.ObjectId();
    const triageSession = {
      _id: sessionId,
      patientId,
      specialty: Specialty.GENERAL_MEDICINE,
      status: 'IN_PROGRESS',
      answers: [{ questionId: 'MG-Q1', answerValue: 'dolor' }],
      save: jest.fn().mockResolvedValue(undefined),
      analysis: undefined,
      completedAt: undefined,
    };

    triageSessionModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(triageSession),
    });
    triageQuestionsRepository.getRequiredQuestionIds.mockReturnValue(['MG-Q1']);
    jest.spyOn(RedFlagsEngine, 'evaluate').mockReturnValue([
      {
        code: 'RF-MG-WARN',
        specialty: Specialty.GENERAL_MEDICINE,
        severity: 'WARNING',
        evidence: 'test',
      },
    ]);
    geminiTriageService.analyzeTriage.mockResolvedValue({
      basePriority: 'LOW',
      aiSummary: 'Resumen neutral',
    });
    guardrailService.check.mockReturnValue({ safe: true, violations: [] });
    consultationsService.createFromTriage.mockResolvedValue(undefined);

    const result = await service.analyzeSession(sessionId.toString(), {
      userId: patientId.toString(),
      email: 'patient@example.com',
      role: UserRole.PATIENT,
      isActive: true,
    });

    expect(result.priority).toBe('MODERATE');
    expect(result.highPriorityAlert).toBe(false);
  });

  it('should mark session FAILED and return 503 when Gemini analysis fails', async () => {
    const sessionId = new Types.ObjectId();
    const patientId = new Types.ObjectId();
    const triageSession = {
      _id: sessionId,
      patientId,
      specialty: Specialty.GENERAL_MEDICINE,
      status: 'IN_PROGRESS',
      answers: [{ questionId: 'MG-Q1', answerValue: 'dolor' }],
      save: jest.fn().mockResolvedValue(undefined),
      analysis: undefined,
      completedAt: undefined,
    };

    triageSessionModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(triageSession),
    });
    triageQuestionsRepository.getRequiredQuestionIds.mockReturnValue(['MG-Q1']);
    jest.spyOn(RedFlagsEngine, 'evaluate').mockReturnValue([]);
    geminiTriageService.analyzeTriage.mockRejectedValue(
      new Error('provider down'),
    );

    await expect(
      service.analyzeSession(
        sessionId.toString(),
        {
          userId: patientId.toString(),
          email: 'patient@example.com',
          role: UserRole.PATIENT,
          isActive: true,
        },
        'corr-ai-failure',
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(triageSession.status).toBe('FAILED');
  });
});
