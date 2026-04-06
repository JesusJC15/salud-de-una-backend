import { randomUUID } from 'crypto';
import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RequestUser } from '../common/interfaces/request-user.interface';
import {
  AI_PROVIDER_TOKEN,
  GEMINI_CONNECTIVITY_PROMPT_KEY,
} from './ai.constants';
import {
  AiGenerationRequest,
  AiGenerationResult,
  AiHealthResult,
  AiProvider,
} from './interfaces/ai-provider.interface';
import { AiAuditLog, AiAuditLogDocument } from './schemas/ai-audit-log.schema';
import {
  AiPromptDefinition,
  AiPromptDefinitionDocument,
} from './schemas/ai-prompt-definition.schema';

type AiReadiness = {
  status: 'up' | 'degraded' | 'disabled';
  detail: string;
  degraded: boolean;
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private lastHealthResult: AiHealthResult | null = null;

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(AiPromptDefinition.name)
    private readonly promptDefinitionModel: Model<AiPromptDefinitionDocument>,
    @InjectModel(AiAuditLog.name)
    private readonly auditLogModel: Model<AiAuditLogDocument>,
    @Inject(AI_PROVIDER_TOKEN)
    private readonly aiProvider: AiProvider | null,
  ) {}

  async healthCheck(
    actor?: RequestUser,
    correlationId?: string,
  ): Promise<AiHealthResult> {
    const baseResult = this.getDisabledOrDegradedResult(correlationId);
    if (baseResult) {
      await this.persistAuditLog({
        provider: baseResult.provider,
        model: baseResult.model,
        promptKey: GEMINI_CONNECTIVITY_PROMPT_KEY,
        promptVersion: 1,
        actorId: actor?.userId,
        actorRole: actor?.role,
        correlationId,
        latencyMs: baseResult.latencyMs,
        status: baseResult.status === 'disabled' ? 'disabled' : 'error',
        errorCode: baseResult.error,
        sanitizedInputSummary: 'health-check',
        sanitizedOutputSummary: baseResult.error ?? baseResult.status,
      });
      this.lastHealthResult = baseResult;
      return baseResult;
    }

    const promptDefinition = await this.promptDefinitionModel
      .findOne({ key: GEMINI_CONNECTIVITY_PROMPT_KEY, active: true })
      .sort({ version: -1 })
      .lean()
      .exec();

    if (!promptDefinition) {
      const result: AiHealthResult = {
        provider: this.configService.get<string>('ai.provider') ?? 'gemini',
        model: this.configService.get<string>('ai.model') ?? 'unknown',
        status: 'down',
        latencyMs: 0,
        checkedAt: new Date().toISOString(),
        degraded: true,
        requestId: correlationId ?? randomUUID(),
        error: 'No active Gemini connectivity prompt definition found',
      };
      this.lastHealthResult = result;
      return result;
    }

    const request: AiGenerationRequest = {
      promptKey: promptDefinition.key,
      promptVersion: promptDefinition.version,
      model: promptDefinition.model,
      systemInstruction: promptDefinition.systemInstruction,
      inputText: 'Return HEALTHY if the provider is reachable.',
      correlationId: correlationId ?? randomUUID(),
      actor: actor
        ? { actorId: actor.userId, actorRole: actor.role }
        : undefined,
    };

    const result = await this.aiProvider!.healthCheck(request);

    await this.persistAuditLog({
      provider: result.provider,
      model: result.model,
      promptKey: promptDefinition.key,
      promptVersion: promptDefinition.version,
      actorId: actor?.userId,
      actorRole: actor?.role,
      correlationId,
      latencyMs: result.latencyMs,
      status: result.status === 'up' ? 'success' : 'error',
      errorCode: result.error,
      sanitizedInputSummary: `prompt=${promptDefinition.key}@${promptDefinition.version};chars=${request.inputText.length}`,
      sanitizedOutputSummary:
        result.status === 'up' ? 'health-check-ok' : (result.error ?? 'failed'),
      tokenUsage: { requestId: result.requestId },
    });

    this.lastHealthResult = result;
    return result;
  }

  async generateText(
    request: AiGenerationRequest,
  ): Promise<AiGenerationResult> {
    if (!this.aiProvider || !this.isEnabled()) {
      throw new ServiceUnavailableException('AI provider is disabled');
    }

    return this.aiProvider.generateText(request);
  }

  getReadiness(): AiReadiness {
    if (!this.isEnabled()) {
      return {
        status: 'disabled',
        detail: 'AI disabled: AI_ENABLED is false',
        degraded: true,
      };
    }

    if (!this.aiProvider || !this.hasRequiredConfiguration()) {
      return {
        status: 'degraded',
        detail: 'AI enabled but provider configuration is incomplete',
        degraded: true,
      };
    }

    if (this.lastHealthResult?.status === 'up') {
      return {
        status: 'up',
        detail: `AI provider healthy (${this.lastHealthResult.model})`,
        degraded: false,
      };
    }

    if (this.lastHealthResult?.status === 'down') {
      return {
        status: 'degraded',
        detail: this.lastHealthResult.error ?? 'Last AI health-check failed',
        degraded: true,
      };
    }

    return {
      status: 'degraded',
      detail: 'AI enabled but connectivity has not been verified yet',
      degraded: true,
    };
  }

  private isEnabled(): boolean {
    return this.configService.get<boolean>('ai.enabled') === true;
  }

  private hasRequiredConfiguration(): boolean {
    return Boolean(
      this.configService.get<string>('ai.provider') &&
      this.configService.get<string>('ai.geminiApiKey') &&
      this.configService.get<string>('ai.model'),
    );
  }

  private getDisabledOrDegradedResult(
    correlationId?: string,
  ): AiHealthResult | null {
    const provider = this.configService.get<string>('ai.provider') ?? 'gemini';
    const model = this.configService.get<string>('ai.model') ?? 'unknown';
    const requestId = correlationId ?? randomUUID();

    if (!this.isEnabled()) {
      return {
        provider,
        model,
        status: 'disabled',
        latencyMs: 0,
        checkedAt: new Date().toISOString(),
        degraded: true,
        requestId,
        error: 'AI is disabled',
      };
    }

    if (!this.aiProvider || !this.hasRequiredConfiguration()) {
      return {
        provider,
        model,
        status: 'down',
        latencyMs: 0,
        checkedAt: new Date().toISOString(),
        degraded: true,
        requestId,
        error: 'AI provider configuration is incomplete',
      };
    }

    return null;
  }

  private async persistAuditLog(payload: Partial<AiAuditLog>): Promise<void> {
    try {
      await this.auditLogModel.create({
        provider: payload.provider,
        model: payload.model,
        promptKey: payload.promptKey,
        promptVersion: payload.promptVersion,
        actorId: payload.actorId,
        actorRole: payload.actorRole,
        correlationId: payload.correlationId,
        latencyMs: payload.latencyMs ?? 0,
        status: payload.status,
        errorCode: payload.errorCode,
        sanitizedInputSummary: payload.sanitizedInputSummary,
        sanitizedOutputSummary: payload.sanitizedOutputSummary,
        tokenUsage: payload.tokenUsage,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to persist AI audit log: ${message}`);
    }
  }
}
