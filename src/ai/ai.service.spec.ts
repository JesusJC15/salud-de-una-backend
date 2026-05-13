import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { UserRole } from '../common/enums/user-role.enum';
import { AiService } from './ai.service';
import type { AiProvider } from './interfaces/ai-provider.interface';

type QueryMock<T> = {
  sort: jest.MockedFunction<() => QueryMock<T>>;
  lean: jest.MockedFunction<() => QueryMock<T>>;
  exec: jest.Mock<Promise<T>, []>;
};

type PromptDefinitionModelMock = {
  findOne: jest.Mock;
  find?: jest.Mock;
  countDocuments?: jest.Mock;
  findById?: jest.Mock;
  updateMany?: jest.Mock;
};

type AuditLogModelMock = {
  create: jest.Mock;
  find?: jest.Mock;
  aggregate?: jest.Mock;
};

type PromptModelFactoryPayload = Record<string, unknown>;
type PromptModelFactoryResult = PromptModelFactoryPayload & {
  save: jest.Mock<Promise<{ id: string }>, []>;
};
type PromptDefinitionFactoryMock = jest.Mock<
  PromptModelFactoryResult,
  [PromptModelFactoryPayload]
> &
  PromptDefinitionModelMock;

function createPromptQuery<T>(result: T): QueryMock<T> {
  return {
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn<Promise<T>, []>().mockResolvedValue(result),
  };
}

describe('AiService', () => {
  const actor = {
    userId: 'admin-1',
    email: 'admin@example.com',
    role: UserRole.ADMIN,
    isActive: true,
  };

  let configService: { get: jest.Mock };
  let promptDefinitionModel: PromptDefinitionModelMock;
  let auditLogModel: AuditLogModelMock;
  let aiProvider: jest.Mocked<AiProvider>;

  function createService(provider: AiProvider | null = aiProvider): AiService {
    return new AiService(
      configService as unknown as ConfigService,
      promptDefinitionModel as never,
      auditLogModel as never,
      provider,
    );
  }

  beforeEach(() => {
    configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, unknown> = {
          'ai.enabled': true,
          'ai.provider': 'gemini',
          'ai.geminiApiKey': 'gemini-key',
          'ai.model': 'gemini-2.5-flash',
          'ai.requestTimeoutMs': 20_000,
        };
        return values[key];
      }),
    };
    promptDefinitionModel = {
      findOne: jest.fn(),
    };
    auditLogModel = {
      create: jest.fn().mockResolvedValue({}),
      aggregate: jest.fn().mockResolvedValue([]),
    };
    aiProvider = {
      generateText: jest.fn(),
      embedContents: jest.fn(),
      healthCheck: jest.fn(),
    };
  });

  it('healthCheck should return disabled when AI is disabled and persist audit log', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'ai.enabled') {
        return false;
      }
      if (key === 'ai.provider') {
        return 'gemini';
      }
      if (key === 'ai.model') {
        return 'gemini-2.5-flash';
      }
      return undefined;
    });
    const service = createService(null);

    const result = await service.healthCheck(actor, 'corr-1');

    expect(result).toMatchObject({
      provider: 'gemini',
      status: 'disabled',
      degraded: true,
      requestId: 'corr-1',
    });
    expect(auditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'disabled',
        promptKey: 'gemini.connectivity.check',
      }),
    );
    expect(service.getReadiness()).toMatchObject({
      status: 'disabled',
      degraded: true,
    });
  });

  it('healthCheck should return down when prompt definition does not exist', async () => {
    promptDefinitionModel.findOne.mockReturnValue(createPromptQuery(null));
    const service = createService();

    const result = await service.healthCheck(actor, 'corr-2');

    expect(result).toMatchObject({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      status: 'down',
      degraded: true,
      requestId: 'corr-2',
    });
    expect(service.getReadiness()).toMatchObject({
      status: 'degraded',
      degraded: true,
    });
  });

  it('healthCheck should call provider and mark readiness up on success', async () => {
    promptDefinitionModel.findOne.mockReturnValue(
      createPromptQuery({
        key: 'gemini.connectivity.check',
        version: 1,
        model: 'gemini-2.5-flash',
        systemInstruction: 'Probe',
      }),
    );
    aiProvider.healthCheck.mockResolvedValue({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      status: 'up',
      latencyMs: 22,
      checkedAt: new Date().toISOString(),
      degraded: false,
      requestId: 'corr-3',
    });
    const service = createService();

    const result = await service.healthCheck(actor, 'corr-3');
    const [healthCheckRequest] = aiProvider.healthCheck.mock.calls[0] as [
      {
        promptKey: string;
        promptVersion: number;
        correlationId?: string;
      },
    ];

    expect(healthCheckRequest).toMatchObject({
      promptKey: 'gemini.connectivity.check',
      promptVersion: 1,
      correlationId: 'corr-3',
    });
    expect(result.status).toBe('up');
    expect(auditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'success',
        tokenUsage: { requestId: 'corr-3' },
      }),
    );
    expect(service.getReadiness()).toMatchObject({
      status: 'up',
      degraded: false,
    });
  });

  it('generateText should throw when provider is disabled', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'ai.enabled') {
        return false;
      }
      return undefined;
    });
    const service = createService(null);

    await expect(
      service.generateText({
        promptKey: 'any',
        promptVersion: 1,
        model: 'gemini-2.5-flash',
        inputText: 'hello',
        systemInstruction: 'be brief',
      }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('generateText should delegate to provider when enabled', async () => {
    aiProvider.generateText.mockResolvedValue({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      text: 'ok',
      latencyMs: 10,
      requestId: 'req-1',
    });
    const service = createService();

    const result = await service.generateText({
      promptKey: 'key',
      promptVersion: 1,
      model: 'gemini-2.5-flash',
      inputText: 'hello',
      systemInstruction: 'be brief',
    });

    expect(result.text).toBe('ok');
    expect(aiProvider.generateText.mock.calls).toHaveLength(1);
    expect(auditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        promptKey: 'key',
        promptVersion: 1,
        status: 'success',
        sanitizedInputSummary: 'hello',
        sanitizedOutputSummary: 'ok',
      }),
    );
  });

  it('generateText should audit and rethrow provider errors', async () => {
    aiProvider.generateText.mockRejectedValue(new Error('provider down'));
    const service = createService();

    await expect(
      service.generateText({
        promptKey: 'key',
        promptVersion: 1,
        model: 'gemini-2.5-flash',
        inputText: 'hello',
        systemInstruction: 'be brief',
      }),
    ).rejects.toThrow('provider down');

    expect(auditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        promptKey: 'key',
        status: 'error',
        errorCode: 'Error',
        sanitizedOutputSummary: 'provider down',
      }),
    );
  });

  it('generateText should timeout with a controlled service error', async () => {
    configService.get.mockImplementation((key: string) => {
      const values: Record<string, unknown> = {
        'ai.enabled': true,
        'ai.provider': 'gemini',
        'ai.geminiApiKey': 'gemini-key',
        'ai.model': 'gemini-2.5-flash',
        'ai.requestTimeoutMs': 1,
      };
      return values[key];
    });
    aiProvider.generateText.mockReturnValue(new Promise(() => undefined));
    const service = createService();

    await expect(
      service.generateText({
        promptKey: 'slow',
        promptVersion: 1,
        model: 'gemini-2.5-flash',
        inputText: 'hello',
        systemInstruction: 'be brief',
      }),
    ).rejects.toThrow(ServiceUnavailableException);

    expect(auditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        promptKey: 'slow',
        status: 'error',
        errorCode: 'ServiceUnavailableException',
      }),
    );
  });

  it('embedTexts should delegate to provider when enabled', async () => {
    aiProvider.embedContents.mockResolvedValue({
      provider: 'gemini',
      model: 'gemini-embedding-001',
      embeddings: [[0.1, 0.2]],
      latencyMs: 9,
      requestId: 'emb-1',
    });
    const service = createService();

    const result = await service.embedTexts({
      model: 'gemini-embedding-001',
      contents: ['dolor toracico'],
    });

    expect(result.embeddings).toEqual([[0.1, 0.2]]);
    expect(aiProvider.embedContents.mock.calls[0]?.[0]).toEqual({
      model: 'gemini-embedding-001',
      contents: ['dolor toracico'],
    });
    expect(auditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        promptKey: 'EMBEDDINGS',
        status: 'success',
      }),
    );
  });

  it('embedTexts should throw when provider is disabled', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'ai.enabled') {
        return false;
      }
      return undefined;
    });
    const service = createService(null);

    await expect(
      service.embedTexts({
        model: 'gemini-embedding-001',
        contents: ['dolor toracico'],
      }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('healthCheck should degrade when provider configuration is incomplete', async () => {
    configService.get.mockImplementation((key: string) => {
      const values: Record<string, unknown> = {
        'ai.enabled': true,
        'ai.provider': 'gemini',
        'ai.model': 'gemini-2.5-flash',
      };
      return values[key];
    });
    const service = createService(null);

    const result = await service.healthCheck(actor, 'corr-4');

    expect(result).toMatchObject({
      status: 'down',
      degraded: true,
      error: 'AI provider configuration is incomplete',
    });
  });

  it('healthCheck should set fallback degraded detail when provider reports down without error', async () => {
    promptDefinitionModel.findOne.mockReturnValue(
      createPromptQuery({
        key: 'gemini.connectivity.check',
        version: 1,
        model: 'gemini-2.5-flash',
        systemInstruction: 'Probe',
      }),
    );
    aiProvider.healthCheck.mockResolvedValue({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      status: 'down',
      latencyMs: 40,
      checkedAt: new Date().toISOString(),
      degraded: true,
      requestId: 'corr-5',
    });
    const service = createService();

    await service.healthCheck(actor, 'corr-5');

    expect(service.getReadiness()).toMatchObject({
      status: 'degraded',
      detail: 'Last AI health-check failed',
    });
  });

  it('getReadiness should report unknown connectivity before first health check', () => {
    const service = createService();

    expect(service.getReadiness()).toMatchObject({
      status: 'degraded',
      detail: 'AI enabled but connectivity has not been verified yet',
      degraded: true,
    });
  });

  it('getReadiness should report degraded when provider configuration is incomplete', () => {
    const service = createService(null);

    expect(service.getReadiness()).toMatchObject({
      status: 'degraded',
      detail: 'AI enabled but provider configuration is incomplete',
      degraded: true,
    });
  });

  it('generateText should throw when provider is null even if AI is enabled', async () => {
    const service = createService(null);

    await expect(
      service.generateText({
        promptKey: 'key',
        promptVersion: 1,
        model: 'gemini-2.5-flash',
        inputText: 'hello',
        systemInstruction: 'be brief',
      }),
    ).rejects.toThrow('AI provider is disabled');
  });

  it('healthCheck should still succeed when actor is omitted', async () => {
    promptDefinitionModel.findOne.mockReturnValue(
      createPromptQuery({
        key: 'gemini.connectivity.check',
        version: 1,
        model: 'gemini-2.5-flash',
        systemInstruction: 'Probe',
      }),
    );
    aiProvider.healthCheck.mockResolvedValue({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      status: 'up',
      latencyMs: 12,
      checkedAt: new Date().toISOString(),
      degraded: false,
      requestId: 'corr-6',
    });
    const service = createService();

    await service.healthCheck(undefined, 'corr-6');

    const [callArg] = aiProvider.healthCheck.mock.calls[0] as [
      { actor?: unknown },
    ];
    expect(callArg.actor).toBeUndefined();
  });

  it('healthCheck should swallow audit-log persistence failures', async () => {
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    configService.get.mockImplementation((key: string) => {
      if (key === 'ai.enabled') {
        return false;
      }
      if (key === 'ai.provider') {
        return 'gemini';
      }
      if (key === 'ai.model') {
        return 'gemini-2.5-flash';
      }
      return undefined;
    });
    auditLogModel.create.mockRejectedValue('store unavailable');
    const service = createService(null);

    await expect(service.healthCheck(actor, 'corr-7')).resolves.toMatchObject({
      status: 'disabled',
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('store unavailable'),
    );
    warnSpy.mockRestore();
  });

  describe('getActivePromptInstruction', () => {
    it('returns systemInstruction when active prompt found', async () => {
      promptDefinitionModel.findOne = jest.fn().mockReturnValue(
        createPromptQuery({
          systemInstruction: 'You are a helpful assistant.',
        }),
      );
      const service = createService();

      const result = await service.getActivePromptInstruction(
        'triage.general_medicine.analyze',
      );

      expect(result).toBe('You are a helpful assistant.');
    });

    it('returns null when no prompt found', async () => {
      promptDefinitionModel.findOne = jest
        .fn()
        .mockReturnValue(createPromptQuery(null));
      const service = createService();

      const result = await service.getActivePromptInstruction('unknown.key');

      expect(result).toBeNull();
    });

    it('returns null and logs warning on DB error', async () => {
      promptDefinitionModel.findOne = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(new Error('DB error')),
      });
      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => {});
      const service = createService();

      const result = await service.getActivePromptInstruction('any.key');

      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('getUsageMetrics', () => {
    it('returns aggregated metrics from audit logs', async () => {
      auditLogModel = {
        aggregate: jest
          .fn()
          .mockResolvedValueOnce([
            { total: 3, successCount: 2, avgLatencyMs: 116.67 },
          ])
          .mockResolvedValueOnce([
            {
              _id: 'triage.general_medicine.analyze',
              count: 2,
            },
            { _id: 'gemini.connectivity.check', count: 1 },
          ]),
        create: jest.fn(),
      };
      const service = createService();

      const result = await service.getUsageMetrics();

      expect(result.total).toBe(3);
      expect(result.successCount).toBe(2);
      expect(result.errorCount).toBe(1);
      expect(result.successRate).toBe(67);
      expect(result.avgLatencyMs).toBe(117);
      expect(result.byPromptKey['triage.general_medicine.analyze']).toBe(2);
    });

    it('returns zero metrics when no audit logs', async () => {
      auditLogModel = {
        aggregate: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      };
      const service = createService();

      const result = await service.getUsageMetrics();

      expect(result.total).toBe(0);
      expect(result.avgLatencyMs).toBe(0);
      expect(result.successRate).toBe(0);
    });
  });

  describe('listPrompts', () => {
    it('returns paginated prompt list', async () => {
      const mockItems = [{ key: 'test.key', version: 1, active: true }];
      promptDefinitionModel = {
        find: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnThis(),
          skip: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          lean: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue(mockItems),
        }),
        countDocuments: jest.fn().mockResolvedValue(1),
      } as never;
      const service = createService();

      const result = await service.listPrompts(1, 20);

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('getPromptVersions', () => {
    it('returns prompt versions sorted descending', async () => {
      const mockItems = [{ key: 'prompt.key', version: 2 }];
      promptDefinitionModel = {
        find: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnThis(),
          lean: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue(mockItems),
        }),
      } as never;
      const service = createService();

      const result = await service.getPromptVersions('prompt.key');

      expect(promptDefinitionModel.find).toHaveBeenCalledWith({
        key: 'prompt.key',
      });
      expect(result).toEqual(mockItems);
    });
  });

  describe('createPromptVersion', () => {
    it('creates the first prompt version using the configured default model', async () => {
      const save: jest.Mock<Promise<{ id: string }>, []> = jest
        .fn<Promise<{ id: string }>, []>()
        .mockResolvedValue({ id: 'saved-prompt' });
      const PromptModel = jest.fn(
        (payload: PromptModelFactoryPayload): PromptModelFactoryResult => ({
          ...payload,
          save,
        }),
      ) as PromptDefinitionFactoryMock;
      PromptModel.findOne = jest.fn().mockReturnValue(createPromptQuery(null));
      PromptModel.updateMany = jest.fn().mockResolvedValue({});
      promptDefinitionModel = PromptModel as never;
      const service = createService();

      const result = await service.createPromptVersion({
        key: 'triage.prompt',
        systemInstruction: 'Be concise',
      });

      expect(PromptModel.updateMany).toHaveBeenCalledWith(
        { key: 'triage.prompt', active: true },
        { $set: { active: false } },
      );
      expect(PromptModel).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'triage.prompt',
          version: 1,
          model: 'gemini-2.5-flash',
          active: true,
        }),
      );
      expect(save).toHaveBeenCalled();
      expect(result).toEqual({ id: 'saved-prompt' });
    });

    it('increments the latest version and respects an explicit model override', async () => {
      const save: jest.Mock<Promise<{ id: string }>, []> = jest
        .fn<Promise<{ id: string }>, []>()
        .mockResolvedValue({ id: 'saved-prompt-2' });
      const PromptModel = jest.fn(
        (payload: PromptModelFactoryPayload): PromptModelFactoryResult => ({
          ...payload,
          save,
        }),
      ) as PromptDefinitionFactoryMock;
      PromptModel.findOne = jest
        .fn()
        .mockReturnValue(createPromptQuery({ version: 4 }));
      PromptModel.updateMany = jest.fn().mockResolvedValue({});
      promptDefinitionModel = PromptModel as never;
      const service = createService();

      await service.createPromptVersion({
        key: 'triage.prompt',
        systemInstruction: 'Override model',
        model: 'gemini-custom',
      });

      expect(PromptModel).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 5,
          model: 'gemini-custom',
        }),
      );
    });
  });

  describe('togglePromptActive', () => {
    it('returns null when prompt not found', async () => {
      promptDefinitionModel = {
        findById: jest
          .fn()
          .mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
      } as never;
      const service = createService();

      const result = await service.togglePromptActive('nonexistent-id', true);

      expect(result).toBeNull();
    });

    it('activates prompt and deactivates others with same key', async () => {
      const mockPrompt = {
        key: 'triage.general_medicine.analyze',
        active: false,
        save: jest.fn().mockResolvedValue(undefined),
        toObject: jest.fn().mockReturnValue({ active: true }),
      };
      promptDefinitionModel = {
        findById: jest
          .fn()
          .mockReturnValue({ exec: jest.fn().mockResolvedValue(mockPrompt) }),
        updateMany: jest.fn().mockResolvedValue({}),
      } as never;
      const service = createService();

      await service.togglePromptActive('some-id', true);

      expect(mockPrompt.active).toBe(true);
      expect(mockPrompt.save).toHaveBeenCalled();
    });

    it('deactivates prompt without touching others', async () => {
      const mockPrompt = {
        key: 'triage.general_medicine.analyze',
        active: true,
        save: jest.fn().mockResolvedValue(undefined),
        toObject: jest.fn().mockReturnValue({ active: false }),
      };
      promptDefinitionModel = {
        findById: jest
          .fn()
          .mockReturnValue({ exec: jest.fn().mockResolvedValue(mockPrompt) }),
      } as never;
      const service = createService();

      await service.togglePromptActive('some-id', false);

      expect(mockPrompt.active).toBe(false);
    });
  });
});
