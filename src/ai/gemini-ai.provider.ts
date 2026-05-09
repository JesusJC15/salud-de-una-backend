import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import {
  ContentEmbedding,
  EmbedContentResponse,
  GoogleGenAI,
} from '@google/genai';
import {
  AiEmbeddingRequest,
  AiEmbeddingResult,
  AiGenerationRequest,
  AiGenerationResult,
  AiHealthResult,
  AiProvider,
} from './interfaces/ai-provider.interface';

@Injectable()
export class GeminiAiProvider implements AiProvider {
  constructor(private readonly client: GoogleGenAI) {}

  private toTokenUsage(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? { ...value }
      : undefined;
  }

  private toEmbeddingValues(embedding: ContentEmbedding): number[] {
    return Array.isArray(embedding.values)
      ? embedding.values.map((value) => Number(value))
      : [];
  }

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
      tokenUsage: this.toTokenUsage(response.usageMetadata),
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

  async embedContents(request: AiEmbeddingRequest): Promise<AiEmbeddingResult> {
    const startedAt = Date.now();
    const response: EmbedContentResponse =
      await this.client.models.embedContent({
        model: request.model,
        contents: request.contents,
        config: {
          taskType: request.taskType,
          outputDimensionality: request.outputDimensionality,
        },
      });

    const embeddings = Array.isArray(response.embeddings)
      ? response.embeddings.map((item) => this.toEmbeddingValues(item))
      : [];

    return {
      provider: 'gemini',
      model: request.model,
      embeddings,
      latencyMs: Date.now() - startedAt,
      requestId: request.correlationId ?? randomUUID(),
      tokenUsage: this.toTokenUsage(response.metadata),
    };
  }
}
