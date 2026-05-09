import { registerAs } from '@nestjs/config';

export default registerAs('rag', () => ({
  summaryEnabled: process.env.RAG_SUMMARY_ENABLED === 'true',
  triageEnabled: process.env.RAG_TRIAGE_ENABLED === 'true',
  patientEvidenceEnabled: process.env.RAG_PATIENT_EVIDENCE_ENABLED === 'true',
  topK: Number(process.env.RAG_TOP_K ?? 8),
  maxContextChunks: Number(process.env.RAG_MAX_CONTEXT_CHUNKS ?? 10),
  embeddingDimensions: Number(process.env.RAG_EMBEDDING_DIMENSIONS ?? 768),
  vectorIndexName:
    process.env.RAG_VECTOR_INDEX_NAME ??
    'salud_de_una_knowledge_chunks_vector_v1',
  embeddingModel: process.env.GEMINI_EMBEDDING_MODEL ?? 'gemini-embedding-001',
}));
