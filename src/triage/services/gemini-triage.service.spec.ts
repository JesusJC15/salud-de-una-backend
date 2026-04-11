import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from '../../ai/ai.service';
import { UserRole } from '../../common/enums/user-role.enum';
import { GeminiTriageService } from './gemini-triage.service';

describe('GeminiTriageService', () => {
  let service: GeminiTriageService;

  const aiService = {
    generateText: jest.fn(),
  };

  const configService = {
    get: jest.fn(),
  };

  const user = {
    userId: 'patient-1',
    email: 'patient@example.com',
    role: UserRole.PATIENT,
    isActive: true,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    configService.get.mockImplementation((key: string) => {
      if (key === 'ai.model') {
        return 'gemini-test-model';
      }

      return undefined;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeminiTriageService,
        {
          provide: AiService,
          useValue: aiService,
        },
        {
          provide: ConfigService,
          useValue: configService,
        },
      ],
    }).compile();

    service = module.get<GeminiTriageService>(GeminiTriageService);
  });

  it('returns parsed priority and summary from valid JSON response', async () => {
    aiService.generateText.mockResolvedValue({
      provider: 'gemini',
      model: 'gemini-test-model',
      text: '{"priority":"HIGH","summary":"Resumen neutral"}',
      latencyMs: 10,
      requestId: 'req-1',
    });

    const result = await service.analyzeTriage([], [], user, 'corr-1');

    expect(aiService.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-test-model',
        correlationId: 'corr-1',
        actor: {
          actorId: user.userId,
          actorRole: user.role,
        },
      }),
    );
    expect(result).toEqual({
      basePriority: 'HIGH',
      aiSummary: 'Resumen neutral',
    });
  });

  it('falls back to default model when ai.model is missing', async () => {
    configService.get.mockReturnValue(undefined);
    aiService.generateText.mockResolvedValue({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      text: '{"priority":"LOW"}',
      latencyMs: 5,
      requestId: 'req-2',
    });

    await service.analyzeTriage([], [], user);

    expect(aiService.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-2.5-flash',
      }),
    );
  });

  it('normalizes unknown priority and ignores non-string summary', async () => {
    aiService.generateText.mockResolvedValue({
      provider: 'gemini',
      model: 'gemini-test-model',
      text: '{"priority":"URGENT","summary":123}',
      latencyMs: 12,
      requestId: 'req-3',
    });

    const result = await service.analyzeTriage([], [], user);

    expect(result).toEqual({
      basePriority: 'LOW',
      aiSummary: undefined,
    });
  });

  it('extracts and parses JSON embedded in plain text', async () => {
    aiService.generateText.mockResolvedValue({
      provider: 'gemini',
      model: 'gemini-test-model',
      text: 'prefix {"priority":"MODERATE","summary":"OK"} suffix',
      latencyMs: 9,
      requestId: 'req-4',
    });

    const result = await service.analyzeTriage([], [], user);

    expect(result).toEqual({
      basePriority: 'MODERATE',
      aiSummary: 'OK',
    });
  });

  it('returns LOW with trimmed raw text when response is not parseable', async () => {
    aiService.generateText.mockResolvedValue({
      provider: 'gemini',
      model: 'gemini-test-model',
      text: '  malformed {json  ',
      latencyMs: 9,
      requestId: 'req-5',
    });

    const result = await service.analyzeTriage([], [], user);

    expect(result).toEqual({
      basePriority: 'LOW',
      aiSummary: 'malformed {json',
    });
  });

  it('returns LOW when embedded JSON is present but still invalid', async () => {
    aiService.generateText.mockResolvedValue({
      provider: 'gemini',
      model: 'gemini-test-model',
      text: 'before {"priority":"HIGH",} after',
      latencyMs: 9,
      requestId: 'req-6',
    });

    const result = await service.analyzeTriage([], [], user);

    expect(result).toEqual({
      basePriority: 'LOW',
      aiSummary: 'before {"priority":"HIGH",} after',
    });
  });
});
