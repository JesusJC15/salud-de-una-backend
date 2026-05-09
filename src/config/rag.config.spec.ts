import ragConfig from './rag.config';

describe('rag.config', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('uses explicit RAG environment values', () => {
    process.env.RAG_SUMMARY_ENABLED = 'true';
    process.env.RAG_TRIAGE_ENABLED = 'true';
    process.env.RAG_PATIENT_EVIDENCE_ENABLED = 'true';
    process.env.RAG_TOP_K = '12';
    process.env.RAG_MAX_CONTEXT_CHUNKS = '6';
    process.env.RAG_EMBEDDING_DIMENSIONS = '1024';
    process.env.RAG_VECTOR_INDEX_NAME = 'custom_vector_index';
    process.env.GEMINI_EMBEDDING_MODEL = 'custom-embedding-model';

    const config = ragConfig();

    expect(config).toEqual({
      summaryEnabled: true,
      triageEnabled: true,
      patientEvidenceEnabled: true,
      topK: 12,
      maxContextChunks: 6,
      embeddingDimensions: 1024,
      vectorIndexName: 'custom_vector_index',
      embeddingModel: 'custom-embedding-model',
    });
  });

  it('falls back to RAG defaults when env vars are absent', () => {
    delete process.env.RAG_SUMMARY_ENABLED;
    delete process.env.RAG_TRIAGE_ENABLED;
    delete process.env.RAG_PATIENT_EVIDENCE_ENABLED;
    delete process.env.RAG_TOP_K;
    delete process.env.RAG_MAX_CONTEXT_CHUNKS;
    delete process.env.RAG_EMBEDDING_DIMENSIONS;
    delete process.env.RAG_VECTOR_INDEX_NAME;
    delete process.env.GEMINI_EMBEDDING_MODEL;

    const config = ragConfig();

    expect(config).toEqual({
      summaryEnabled: false,
      triageEnabled: false,
      patientEvidenceEnabled: false,
      topK: 8,
      maxContextChunks: 10,
      embeddingDimensions: 768,
      vectorIndexName: 'salud_de_una_knowledge_chunks_vector_v1',
      embeddingModel: 'gemini-embedding-001',
    });
  });
});
