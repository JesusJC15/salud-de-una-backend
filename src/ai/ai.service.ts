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
  AiEmbeddingRequest,
  AiEmbeddingResult,
  AiGenerationRequest,
  AiGenerationResult,
  AiHealthResult,
  AiProvider,
} from './interfaces/ai-provider.interface';
import { AiAuditLog } from './schemas/ai-audit-log.schema';
import {
  AiPromptDefinition,
  AiPromptDefinitionDocument,
} from './schemas/ai-prompt-definition.schema';

type AiReadiness = {
  status: 'up' | 'degraded' | 'disabled';
  detail: string;
  degraded: boolean;
};

type AiAuditLogCreatePayload = {
  provider?: string;
  model: string;
  promptKey?: string;
  promptVersion?: number;
  actorId?: string;
  actorRole?: AiAuditLog['actorRole'];
  correlationId?: string;
  latencyMs: number;
  status?: AiAuditLog['status'];
  errorCode?: string;
  sanitizedInputSummary?: string;
  sanitizedOutputSummary?: string;
  tokenUsage?: Record<string, unknown>;
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
    private readonly auditLogModel: Model<AiAuditLog>,
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

    const startedAt = Date.now();
    try {
      const result = await this.withTimeout(
        this.aiProvider.generateText(request),
        this.getRequestTimeoutMs(),
        `AI generation timed out after ${this.getRequestTimeoutMs()}ms`,
      );
      await this.persistAuditLog({
        provider: result.provider,
        model: result.model,
        promptKey: request.promptKey,
        promptVersion: request.promptVersion,
        actorId: request.actor?.actorId,
        actorRole: request.actor?.actorRole,
        correlationId: request.correlationId,
        latencyMs: result.latencyMs,
        status: 'success',
        sanitizedInputSummary: this.summarizeText(request.inputText),
        sanitizedOutputSummary: this.summarizeText(result.text),
        tokenUsage: result.tokenUsage,
      });
      return result;
    } catch (error: unknown) {
      const normalized = this.normalizeError(error);
      await this.persistAuditLog({
        provider: this.configService.get<string>('ai.provider') ?? 'gemini',
        model: request.model,
        promptKey: request.promptKey,
        promptVersion: request.promptVersion,
        actorId: request.actor?.actorId,
        actorRole: request.actor?.actorRole,
        correlationId: request.correlationId,
        latencyMs: Date.now() - startedAt,
        status: 'error',
        errorCode: normalized.name,
        sanitizedInputSummary: this.summarizeText(request.inputText),
        sanitizedOutputSummary: normalized.message,
      });
      throw error;
    }
  }

  async embedTexts(request: AiEmbeddingRequest): Promise<AiEmbeddingResult> {
    if (!this.aiProvider || !this.isEnabled()) {
      throw new ServiceUnavailableException('AI provider is disabled');
    }

    const startedAt = Date.now();
    try {
      const result = await this.withTimeout(
        this.aiProvider.embedContents(request),
        this.getRequestTimeoutMs(),
        `AI embedding timed out after ${this.getRequestTimeoutMs()}ms`,
      );
      await this.persistAuditLog({
        provider: result.provider,
        model: result.model,
        promptKey: 'EMBEDDINGS',
        promptVersion: 1,
        correlationId: request.correlationId,
        latencyMs: result.latencyMs,
        status: 'success',
        sanitizedInputSummary: `contents=${request.contents.length};chars=${request.contents.reduce((sum, item) => sum + item.length, 0)}`,
        sanitizedOutputSummary: `embeddings=${result.embeddings.length};dimensions=${result.embeddings[0]?.length ?? 0}`,
        tokenUsage: result.tokenUsage,
      });
      return result;
    } catch (error: unknown) {
      const normalized = this.normalizeError(error);
      await this.persistAuditLog({
        provider: this.configService.get<string>('ai.provider') ?? 'gemini',
        model: request.model,
        promptKey: 'EMBEDDINGS',
        promptVersion: 1,
        correlationId: request.correlationId,
        latencyMs: Date.now() - startedAt,
        status: 'error',
        errorCode: normalized.name,
        sanitizedInputSummary: `contents=${request.contents.length};chars=${request.contents.reduce((sum, item) => sum + item.length, 0)}`,
        sanitizedOutputSummary: normalized.message,
      });
      throw error;
    }
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
      const auditLogPayload: AiAuditLogCreatePayload = {
        provider: payload.provider,
        model: payload.model ?? 'unknown',
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
      };

      await this.auditLogModel.create(auditLogPayload);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to persist AI audit log: ${message}`);
    }
  }

  private getRequestTimeoutMs(): number {
    return this.configService.get<number>('ai.requestTimeoutMs') ?? 20_000;
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    message: string,
  ): Promise<T> {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new ServiceUnavailableException(message));
        }, timeoutMs);
      });

      return await Promise.race([promise, timeout]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private summarizeText(value: string): string {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (normalized.length <= 240) {
      return normalized;
    }

    return `${normalized.slice(0, 237)}...`;
  }

  private normalizeError(error: unknown): { name: string; message: string } {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
      };
    }

    return {
      name: 'UnknownError',
      message: String(error),
    };
  }

  async getUsageMetrics() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const logs = await this.auditLogModel
      .find({ createdAt: { $gte: since } })
      .lean()
      .exec();

    const total = logs.length;
    const successCount = logs.filter((l) => l.status === 'success').length;
    const errorCount = total - successCount;
    const avgLatencyMs =
      total > 0
        ? Math.round(logs.reduce((sum, l) => sum + l.latencyMs, 0) / total)
        : 0;

    const byPromptKey: Record<string, number> = {};
    for (const log of logs) {
      byPromptKey[log.promptKey] = (byPromptKey[log.promptKey] ?? 0) + 1;
    }

    return {
      windowHours: 24,
      total,
      successCount,
      errorCount,
      successRate: total > 0 ? Math.round((successCount / total) * 100) : 0,
      avgLatencyMs,
      byPromptKey,
    };
  }

  async getActivePromptInstruction(key: string): Promise<string | null> {
    try {
      const prompt = await this.promptDefinitionModel
        .findOne({ key, active: true })
        .sort({ version: -1 })
        .lean()
        .exec();

      return prompt?.systemInstruction ?? null;
    } catch {
      this.logger.warn(
        `Failed to load prompt instruction for key "${key}" — using fallback`,
      );
      return null;
    }
  }

  async listPrompts(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.promptDefinitionModel
        .find()
        .sort({ key: 1, version: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.promptDefinitionModel.countDocuments(),
    ]);
    return { items, total, page, limit };
  }

  async getPromptVersions(key: string) {
    return this.promptDefinitionModel
      .find({ key })
      .sort({ version: -1 })
      .lean()
      .exec();
  }

  async createPromptVersion(dto: {
    key: string;
    systemInstruction: string;
    model?: string;
  }) {
    const defaultModel =
      this.configService.get<string>('ai.model') ?? 'gemini-2.5-flash';
    const latest = await this.promptDefinitionModel
      .findOne({ key: dto.key })
      .sort({ version: -1 })
      .lean()
      .exec();

    const nextVersion = (latest?.version ?? 0) + 1;

    await this.promptDefinitionModel.updateMany(
      { key: dto.key, active: true },
      { $set: { active: false } },
    );

    const doc = new this.promptDefinitionModel({
      key: dto.key,
      version: nextVersion,
      provider: 'gemini',
      model: dto.model ?? defaultModel,
      active: true,
      systemInstruction: dto.systemInstruction,
      metadata: { createdByAdmin: true },
    });
    return doc.save();
  }

  async togglePromptActive(id: string, active: boolean) {
    const prompt = await this.promptDefinitionModel.findById(id).exec();
    if (!prompt) {
      return null;
    }

    if (active) {
      await this.promptDefinitionModel.updateMany(
        { key: prompt.key, active: true, _id: { $ne: id } },
        { $set: { active: false } },
      );
    }

    prompt.active = active;
    await prompt.save();
    return prompt.toObject();
  }
}
