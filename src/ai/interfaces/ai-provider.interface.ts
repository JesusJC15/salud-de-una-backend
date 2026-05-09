import { UserRole } from '../../common/enums/user-role.enum';

export type AiActor = {
  actorId: string;
  actorRole: UserRole;
};

export type AiGenerationRequest = {
  promptKey: string;
  promptVersion: number;
  model: string;
  inputText: string;
  systemInstruction: string;
  correlationId?: string;
  actor?: AiActor;
};

export type AiGenerationResult = {
  provider: string;
  model: string;
  text: string;
  latencyMs: number;
  requestId: string;
  tokenUsage?: Record<string, unknown>;
};

export type AiEmbeddingRequest = {
  model: string;
  contents: string[];
  correlationId?: string;
  taskType?:
    | 'RETRIEVAL_DOCUMENT'
    | 'RETRIEVAL_QUERY'
    | 'SEMANTIC_SIMILARITY'
    | 'CLASSIFICATION'
    | 'CLUSTERING';
  outputDimensionality?: number;
};

export type AiEmbeddingResult = {
  provider: string;
  model: string;
  embeddings: number[][];
  latencyMs: number;
  requestId: string;
  tokenUsage?: Record<string, unknown>;
};

export type AiHealthResult = {
  provider: string;
  model: string;
  status: 'up' | 'down' | 'disabled';
  latencyMs: number;
  checkedAt: string;
  degraded: boolean;
  requestId: string;
  error?: string;
};

export interface AiProvider {
  generateText(request: AiGenerationRequest): Promise<AiGenerationResult>;
  embedContents(request: AiEmbeddingRequest): Promise<AiEmbeddingResult>;
  healthCheck(request: AiGenerationRequest): Promise<AiHealthResult>;
}
