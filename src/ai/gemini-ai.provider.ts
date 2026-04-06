import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import {
  AiGenerationRequest,
  AiGenerationResult,
  AiHealthResult,
  AiProvider,
} from './interfaces/ai-provider.interface';

@Injectable()
export class GeminiAiProvider implements AiProvider {
  constructor(private readonly client: GoogleGenAI) {}

  async generateText(
    request: AiGenerationRequest,
  ): Promise<AiGenerationResult> {
    const startedAt = Date.now();
    const response = await this.client.models.generateContent({
      model: request.model,
      contents: request.inputText,
      config: {
        systemInstruction: request.systemInstruction,
      },
    });

    return {
      provider: 'gemini',
      model: request.model,
      text: response.text ?? '',
      latencyMs: Date.now() - startedAt,
      requestId: request.correlationId ?? randomUUID(),
      tokenUsage:
        (response.usageMetadata as Record<string, unknown> | undefined) ??
        undefined,
    };
  }

  async healthCheck(request: AiGenerationRequest): Promise<AiHealthResult> {
    try {
      const result = await this.generateText(request);
      return {
        provider: result.provider,
        model: result.model,
        status: 'up',
        latencyMs: result.latencyMs,
        checkedAt: new Date().toISOString(),
        degraded: false,
        requestId: result.requestId,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        provider: 'gemini',
        model: request.model,
        status: 'down',
        latencyMs: 0,
        checkedAt: new Date().toISOString(),
        degraded: true,
        requestId: request.correlationId ?? randomUUID(),
        error: message,
      };
    }
  }
}
