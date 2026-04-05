import { Test, TestingModule } from '@nestjs/testing';
import { Specialty } from '../common/enums/specialty.enum';
import { UserRole } from '../common/enums/user-role.enum';
import type { RequestContext } from '../common/interfaces/request-context.interface';
import { TriageController } from './triage.controller';
import { TriageService } from './triage.service';

describe('TriageController', () => {
  let controller: TriageController;
  let service: {
    createSession: jest.Mock;
    saveAnswers: jest.Mock;
    analyzeSession: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      createSession: jest.fn(),
      saveAnswers: jest.fn(),
      analyzeSession: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TriageController],
      providers: [{ provide: TriageService, useValue: service }],
    }).compile();

    controller = module.get<TriageController>(TriageController);
  });

  it('createSession should call service', async () => {
    service.createSession.mockResolvedValue({ sessionId: 's1' });

    const request = {
      user: {
        userId: 'p1',
        email: 'patient@example.com',
        role: UserRole.PATIENT,
        isActive: true,
      },
      correlationId: 'corr-1',
    } as unknown as RequestContext;

    const result = await controller.createSession(request, {
      specialty: Specialty.GENERAL_MEDICINE,
    });

    expect(service.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'p1' }),
      { specialty: Specialty.GENERAL_MEDICINE },
      'corr-1',
    );
    expect(result).toEqual({ sessionId: 's1' });
  });

  it('saveAnswers should call service', async () => {
    service.saveAnswers.mockResolvedValue({
      sessionId: 's1',
      answersCount: 1,
      isComplete: false,
    });

    const request = {
      user: {
        userId: 'p1',
        email: 'patient@example.com',
        role: UserRole.PATIENT,
        isActive: true,
      },
      correlationId: 'corr-2',
    } as unknown as RequestContext;

    const result = await controller.saveAnswers(request, 's1', {
      answers: [{ questionId: 'MG-Q1', answerValue: 'si' }],
    });

    expect(service.saveAnswers).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ userId: 'p1' }),
      { answers: [{ questionId: 'MG-Q1', answerValue: 'si' }] },
      'corr-2',
    );
    expect(result).toEqual({
      sessionId: 's1',
      answersCount: 1,
      isComplete: false,
    });
  });

  it('analyzeSession should call service', async () => {
    service.analyzeSession.mockResolvedValue({
      sessionId: 's1',
      priority: 'HIGH',
      redFlags: [],
      message: 'ok',
    });

    const request = {
      user: {
        userId: 'p1',
        email: 'patient@example.com',
        role: UserRole.PATIENT,
        isActive: true,
      },
      correlationId: 'corr-3',
    } as unknown as RequestContext;

    const result = await controller.analyzeSession(request, 's1');

    expect(service.analyzeSession).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ userId: 'p1' }),
      'corr-3',
    );
    expect(result).toEqual({
      sessionId: 's1',
      priority: 'HIGH',
      redFlags: [],
      message: 'ok',
    });
  });
});
