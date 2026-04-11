import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { UserRole } from '../common/enums/user-role.enum';
import { AiService } from './ai.service';
import type { AiProvider } from './interfaces/ai-provider.interface';

function createPromptQuery(result: unknown) {
  return {
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(result),
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
  let promptDefinitionModel: { findOne: jest.Mock };
  let auditLogModel: { create: jest.Mock };
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
        };
        return values[key];
      }),
    };
    promptDefinitionModel = {
      findOne: jest.fn(),
    };
    auditLogModel = {
      create: jest.fn().mockResolvedValue({}),
    };
    aiProvider = {
      generateText: jest.fn(),
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
    ).rejects.toThrow('AI provider is disabled');
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
});
