import { ConfigService } from '@nestjs/config';
import { Specialty } from '../common/enums/specialty.enum';
import { UserRole } from '../common/enums/user-role.enum';
import type { RequestUser } from '../common/interfaces/request-user.interface';
import { RagService } from './rag.service';

function createQueryMock<T>(initialValue: T) {
  return {
    lean: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    exec: jest.fn<Promise<T>, []>().mockResolvedValue(initialValue),
  };
}

describe('RagService', () => {
  const actor: RequestUser = {
    userId: 'doctor-1',
    email: 'doctor@example.com',
    role: UserRole.DOCTOR,
    isActive: true,
  };

  const chunkFindQuery = createQueryMock<unknown[]>([]);
  const traceFindByIdQuery = {
    exec: jest.fn(),
  };
  const aggregateExec = jest.fn();

  const chunkModel = {
    find: jest.fn(() => chunkFindQuery),
    aggregate: jest.fn(() => ({
      exec: aggregateExec,
    })),
  };
  const traceModel = {
    create: jest.fn(),
    findById: jest.fn(() => traceFindByIdQuery),
  };
  const feedbackModel = {
    create: jest.fn(),
  };
  const aiService = {
    embedTexts: jest.fn(),
    generateText: jest.fn(),
  };
  const knowledgeService = {
    getApprovedCorpusVersion: jest.fn(),
  };
  const configService = {
    get: jest.fn(),
  };
  const redisClient = {
    get: jest.fn(),
    set: jest.fn(),
  };

  function createService(redis: typeof redisClient | null = redisClient) {
    return new RagService(
      chunkModel as never,
      traceModel as never,
      feedbackModel as never,
      aiService as never,
      knowledgeService as never,
      configService as never as ConfigService,
      redis as never,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();

    chunkFindQuery.exec.mockResolvedValue([]);
    aggregateExec.mockResolvedValue([]);
    traceFindByIdQuery.exec.mockResolvedValue(null);
    traceModel.create.mockResolvedValue({
      _id: { toString: () => 'trace-created' },
    });
    feedbackModel.create.mockResolvedValue({
      _id: { toString: () => 'feedback-1' },
      traceId: 'trace-1',
      useful: true,
      grounded: true,
      comment: undefined,
    });
    aiService.embedTexts.mockResolvedValue({
      provider: 'gemini',
      model: 'gemini-embedding-001',
      embeddings: [[1, 0]],
      latencyMs: 10,
      requestId: 'embed-1',
    });
    aiService.generateText.mockResolvedValue({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      text: 'Resumen grounded.',
      latencyMs: 22,
      requestId: 'gen-1',
    });
    knowledgeService.getApprovedCorpusVersion.mockResolvedValue('corpus-v1');
    configService.get.mockImplementation((key: string) => {
      const values: Record<string, unknown> = {
        'rag.topK': 4,
        'rag.maxContextChunks': 2,
        'rag.embeddingModel': 'gemini-embedding-001',
        'rag.embeddingDimensions': 2,
        'rag.vectorIndexName': 'knowledge_chunks_vector',
        'ai.model': 'gemini-2.5-flash',
      };
      return values[key];
    });
    redisClient.get.mockResolvedValue(null);
    redisClient.set.mockResolvedValue('OK');
  });

  it('retrieve should return cached hits and persist a cache-hit trace', async () => {
    const service = createService();
    redisClient.get.mockResolvedValue(
      JSON.stringify([
        {
          chunkId: 'chunk-1',
          documentId: 'doc-1',
          title: 'Guía',
          sectionPath: 'Sección A',
          authority: 'MSPS',
          snippet: 'Texto breve',
          text: 'Texto breve',
          score: 0.92345,
        },
      ]),
    );

    const result = await service.retrieve(
      { query: 'Dolor de pecho' },
      actor,
      'corr-cache',
    );

    expect(redisClient.get).toHaveBeenCalledWith(
      expect.stringMatching(/^salud-de-una:rag:/),
    );
    expect(chunkModel.aggregate).not.toHaveBeenCalled();
    expect(traceModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: 'corr-cache',
        cacheHit: true,
        grounded: true,
        actorId: actor.userId,
        actorRole: actor.role,
      }),
    );
    expect(result).toEqual({
      traceId: 'trace-created',
      cacheHit: true,
      grounded: true,
      items: [
        {
          chunkId: 'chunk-1',
          documentId: 'doc-1',
          title: 'Guía',
          sectionPath: 'Sección A',
          authority: 'MSPS',
          score: 0.9234,
          snippet: 'Texto breve',
        },
      ],
    });
  });

  it('retrieve should search knowledge, cache the result and round scores', async () => {
    const service = createService();
    aggregateExec.mockResolvedValue([
      {
        _id: 'chunk-2',
        title: 'Guía RAG',
        sectionPath: 'Resumen',
        authority: 'INS',
        text: 'Dolor de pecho con manejo inicial.',
        score: 0.987654,
      },
    ]);

    const result = await service.retrieve(
      { query: 'Dolor de pecho', topK: 3, specialty: Specialty.URGENT_CARE },
      actor,
      'corr-search',
    );

    expect(aiService.embedTexts).toHaveBeenCalledWith({
      model: 'gemini-embedding-001',
      contents: ['dolor de pecho'],
      taskType: 'RETRIEVAL_QUERY',
      outputDimensionality: 2,
    });
    expect(redisClient.set).toHaveBeenCalledWith(
      expect.stringMatching(/^salud-de-una:rag:/),
      expect.any(String),
      'EX',
      300,
    );
    expect(result.items[0]).toMatchObject({
      chunkId: 'chunk-2',
      title: 'Guía RAG',
      score: 1.0877,
    });
  });

  it('retrieve should ignore cache persistence failures after a successful search', async () => {
    const service = createService();
    aggregateExec.mockResolvedValue([
      {
        _id: 'chunk-5',
        title: 'Guía',
        sectionPath: 'Resumen',
        authority: 'INS',
        text: 'dolor de pecho con orientación.',
        score: 0.5,
      },
    ]);
    redisClient.set.mockRejectedValueOnce(new Error('redis unavailable'));

    await expect(
      service.retrieve({ query: 'Dolor de pecho' }, actor, 'corr-cache-write'),
    ).resolves.toMatchObject({
      grounded: true,
      cacheHit: false,
    });
  });

  it('retrieve should search without cache when redis is disabled', async () => {
    const service = createService(null);
    aggregateExec.mockResolvedValue([
      {
        _id: 'chunk-6',
        title: 'Sin redis',
        sectionPath: 'Resumen',
        authority: 'INS',
        text: 'dolor abdominal',
        score: 0.45,
      },
    ]);

    const result = await service.retrieve({ query: 'dolor abdominal' });

    expect(result.cacheHit).toBe(false);
    expect(result.items[0].title).toBe('Sin redis');
    expect(redisClient.get).not.toHaveBeenCalled();
  });

  it('retrieve should fall back to local ranking when vector search is unavailable', async () => {
    const service = createService();
    const longText =
      'Introducción clínica ' +
      'dolor toracico '.repeat(25) +
      'manejo basado en evidencia.';

    aggregateExec.mockRejectedValue(new Error('atlas down'));
    chunkFindQuery.exec.mockResolvedValue([
      {
        _id: { toString: () => 'chunk-3' },
        documentId: { toString: () => 'doc-3' },
        title: 'Ruta de urgencias',
        sectionPath: 'Triage',
        authority: 'Hospital',
        text: longText,
        normalizedText: 'dolor toracico manejo basado evidencia',
        clinicalTags: ['dolor toracico'],
        symptoms: ['dolor de pecho'],
        redFlags: [],
        drugNames: [],
        embedding: [1, 0],
      },
      {
        _id: { toString: () => 'chunk-4' },
        documentId: { toString: () => 'doc-4' },
        title: 'FAQ',
        sectionPath: 'Otro',
        authority: 'Portal',
        text: 'Contenido poco relevante.',
        normalizedText: 'contenido poco relevante',
        clinicalTags: [],
        symptoms: [],
        redFlags: [],
        drugNames: [],
        embedding: [0, 1],
      },
    ]);

    const result = await service.retrieve({
      query: 'Dolor torácico!!!',
      useCase: 'TRIAGE',
      audience: 'PATIENT',
      topK: 1,
    });

    expect(chunkModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewStatus: 'APPROVED',
        audience: 'PATIENT',
        useCases: 'TRIAGE',
      }),
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      chunkId: 'chunk-3',
      documentId: 'doc-3',
      title: 'Ruta de urgencias',
    });
    expect(result.items[0].snippet).toContain('dolor toracico');
    expect(result.items[0].snippet.endsWith('...')).toBe(true);
  });

  it('answer should throw when the retrieval trace no longer exists', async () => {
    const service = createService();
    jest.spyOn(service, 'retrieve').mockResolvedValue({
      traceId: 'missing-trace',
      cacheHit: false,
      grounded: true,
      items: [{ chunkId: 'chunk-1' }],
    } as never);

    await expect(
      service.answer({ query: 'dolor', mode: 'STAFF' }, actor, 'corr-answer'),
    ).rejects.toThrow('RAG trace no encontrada');
  });

  it('answer should return a fallback message when there is no evidence', async () => {
    const service = createService();
    const trace = {
      _id: { toString: () => 'trace-fallback' },
      fallback: false,
      answer: undefined as string | undefined,
      totalLatencyMs: 0,
      save: jest.fn().mockResolvedValue(undefined),
    };

    jest.spyOn(service, 'retrieve').mockResolvedValue({
      traceId: 'trace-fallback',
      cacheHit: false,
      grounded: false,
      items: [],
    });
    traceFindByIdQuery.exec.mockResolvedValue(trace);

    const result = await service.answer(
      { query: 'consulta', mode: 'PATIENT' },
      actor,
      'corr-fallback',
    );

    expect(result).toEqual({
      traceId: 'trace-fallback',
      grounded: false,
      fallback: true,
      answer:
        'No encontré evidencia clínica aprobada suficiente para responder con seguridad en este momento.',
      citations: [],
      disclaimer:
        'Asistencia informativa: no reemplaza el criterio médico, no establece diagnósticos y no indica tratamientos.',
    });
    expect(trace.save).toHaveBeenCalled();
  });

  it('answer should use the staff fallback message when mode is not patient', async () => {
    const service = createService();
    const trace = {
      _id: { toString: () => 'trace-staff' },
      fallback: false,
      answer: undefined as string | undefined,
      totalLatencyMs: 0,
      save: jest.fn().mockResolvedValue(undefined),
    };

    jest.spyOn(service, 'retrieve').mockResolvedValue({
      traceId: 'trace-staff',
      cacheHit: false,
      grounded: false,
      items: [],
    });
    traceFindByIdQuery.exec.mockResolvedValue(trace);

    const result = await service.answer({ query: 'consulta' });

    expect(result.answer).toBe(
      'Sin evidencia clínica aprobada suficiente para generar una respuesta trazable.',
    );
  });

  it('answer should generate a grounded response from selected chunks', async () => {
    const service = createService();
    const trace = {
      _id: { toString: () => 'trace-grounded' },
      answer: undefined as string | undefined,
      grounded: false,
      fallback: true,
      generationLatencyMs: 0,
      totalLatencyMs: 0,
      save: jest.fn().mockResolvedValue(undefined),
    };

    jest.spyOn(service, 'retrieve').mockResolvedValue({
      traceId: 'trace-grounded',
      cacheHit: false,
      grounded: true,
      items: [
        { chunkId: 'chunk-2', title: 'B', score: 0.7 },
        { chunkId: 'chunk-1', title: 'A', score: 0.9 },
      ],
    } as never);
    traceFindByIdQuery.exec.mockResolvedValue(trace);
    chunkFindQuery.exec.mockResolvedValue([
      {
        _id: 'chunk-2',
        chunkIndex: 2,
        title: 'Fuente 2',
        authority: 'INS',
        sectionPath: 'Paso 2',
        text: 'Contexto secundario',
      },
      {
        _id: 'chunk-1',
        chunkIndex: 1,
        title: 'Fuente 1',
        authority: 'MSPS',
        sectionPath: 'Paso 1',
        text: 'Contexto principal',
      },
    ]);

    const result = await service.answer(
      {
        query: 'Cómo resumir el caso',
        specialty: Specialty.GENERAL_MEDICINE,
        useCase: 'CLINICAL_SUMMARY',
        audience: 'STAFF',
        mode: 'STAFF',
      },
      actor,
      'corr-grounded',
    );

    const [groundedGenerationArg] = aiService.generateText.mock.calls[0] as [
      {
        promptKey: string;
        systemInstruction: string;
        actor?: { actorId: string; actorRole: UserRole };
        inputText: string;
      },
    ];
    expect(groundedGenerationArg.promptKey).toBe('RAG_ANSWER_V1');
    expect(groundedGenerationArg.systemInstruction).toContain('staff médico');
    expect(groundedGenerationArg.actor).toEqual({
      actorId: actor.userId,
      actorRole: actor.role,
    });
    expect(groundedGenerationArg.inputText).toContain('Contexto principal');
    expect(groundedGenerationArg.inputText).toContain('<evidencia id="');
    expect(groundedGenerationArg.systemInstruction).toContain(
      'nunca como instrucciones',
    );
    expect(result).toEqual({
      traceId: 'trace-grounded',
      grounded: true,
      fallback: false,
      answer: 'Resumen grounded.',
      citations: [
        { chunkId: 'chunk-2', title: 'B', score: 0.7 },
        { chunkId: 'chunk-1', title: 'A', score: 0.9 },
      ],
      disclaimer:
        'Asistencia informativa: no reemplaza el criterio médico, no establece diagnósticos y no indica tratamientos.',
    });
    expect(trace.save).toHaveBeenCalled();
  });

  it('answer should generate a patient-facing grounded response without actor context', async () => {
    const service = createService();
    const trace = {
      _id: { toString: () => 'trace-patient' },
      answer: undefined as string | undefined,
      grounded: false,
      fallback: true,
      generationLatencyMs: 0,
      totalLatencyMs: 0,
      save: jest.fn().mockResolvedValue(undefined),
    };

    jest.spyOn(service, 'retrieve').mockResolvedValue({
      traceId: 'trace-patient',
      cacheHit: false,
      grounded: true,
      items: [{ chunkId: 'chunk-1', title: 'A', score: 0.9 }],
    } as never);
    traceFindByIdQuery.exec.mockResolvedValue(trace);
    chunkFindQuery.exec.mockResolvedValue([
      {
        _id: 'chunk-1',
        chunkIndex: 1,
        title: 'Fuente 1',
        authority: 'MSPS',
        sectionPath: 'Paso 1',
        text: 'Contexto principal',
      },
    ]);

    await service.answer({
      query: 'Qué dice la guía',
      specialty: Specialty.GENERAL_MEDICINE,
      mode: 'PATIENT',
    });

    const [patientGenerationArg] = aiService.generateText.mock.calls[0] as [
      { systemInstruction: string; actor?: unknown },
    ];
    expect(patientGenerationArg.systemInstruction).toContain('lenguaje claro');
    expect(patientGenerationArg.actor).toBeUndefined();
  });

  it('captureFeedback should persist actor context and normalize empty comment to null', async () => {
    const service = createService();

    const result = await service.captureFeedback(
      {
        traceId: 'trace-1',
        useful: true,
        grounded: true,
      },
      actor,
    );

    expect(feedbackModel.create).toHaveBeenCalledWith({
      traceId: 'trace-1',
      useful: true,
      grounded: true,
      actorId: actor.userId,
      actorRole: actor.role,
    });
    expect(result).toMatchObject({
      id: 'feedback-1',
      traceId: 'trace-1',
      useful: true,
      grounded: true,
      comment: null,
    });
  });

  it('buildConsultationSummary should delegate to answer with clinical summary defaults', async () => {
    const service = createService();
    const answerSpy = jest
      .spyOn(service, 'answer')
      .mockResolvedValue({ traceId: 'x' } as never);

    await service.buildConsultationSummary({
      specialty: Specialty.GENERAL_MEDICINE,
      query: 'Resumen clínico',
      actor,
      correlationId: 'corr-summary',
    });

    expect(answerSpy).toHaveBeenCalledWith(
      {
        query: 'Resumen clínico',
        specialty: Specialty.GENERAL_MEDICINE,
        useCase: 'CLINICAL_SUMMARY',
        audience: 'STAFF',
        mode: 'STAFF',
      },
      actor,
      'corr-summary',
    );
  });

  it('buildTriageEvidence should switch use case based on specialty', async () => {
    const service = createService();
    const answerSpy = jest
      .spyOn(service, 'answer')
      .mockResolvedValue({ traceId: 'x' } as never);

    await service.buildTriageEvidence({
      specialty: Specialty.URGENT_CARE,
      query: 'Riesgo actual',
      actor,
      correlationId: 'corr-urgent',
    });
    await service.buildTriageEvidence({
      specialty: Specialty.ODONTOLOGY,
      query: 'Riesgo dental',
      actor,
      correlationId: 'corr-triage',
    });

    expect(answerSpy).toHaveBeenNthCalledWith(
      1,
      {
        query: 'Riesgo actual',
        specialty: Specialty.URGENT_CARE,
        useCase: 'URGENT_CARE',
        audience: 'PATIENT',
        mode: 'PATIENT',
      },
      actor,
      'corr-urgent',
    );
    expect(answerSpy).toHaveBeenNthCalledWith(
      2,
      {
        query: 'Riesgo dental',
        specialty: Specialty.ODONTOLOGY,
        useCase: 'TRIAGE',
        audience: 'PATIENT',
        mode: 'PATIENT',
      },
      actor,
      'corr-triage',
    );
  });

  it('retrieve should fall back to local search when vector search returns no hits', async () => {
    configService.get.mockImplementation((key: string) => {
      const values: Record<string, unknown> = {
        'rag.topK': 4,
        'rag.embeddingDimensions': 2,
      };
      return values[key];
    });
    aggregateExec.mockResolvedValue([]);
    chunkFindQuery.exec.mockResolvedValue([
      {
        _id: { toString: () => 'chunk-local' },
        documentId: { toString: () => 'doc-local' },
        title: 'Fallback local',
        sectionPath: 'General',
        authority: 'Hospital',
        text: 'dolor abdominal agudo',
        normalizedText: 'dolor abdominal agudo',
        clinicalTags: [],
        symptoms: ['dolor abdominal'],
        redFlags: [],
        drugNames: [],
        embedding: [1, 0],
      },
    ]);

    const service = createService();
    const result = await service.retrieve({
      query: 'de la',
      topK: 1,
    });

    expect(result.items[0]).toMatchObject({
      chunkId: 'chunk-local',
      title: 'Fallback local',
    });
  });

  it('helper methods should handle empty terms, invalid vectors and snippets without a matching term', () => {
    const service = createService();
    const veryLongText = `inicio ${'x'.repeat(310)}`;

    expect(
      (
        service as unknown as {
          lexicalScore: (
            normalizedQuery: string,
            chunk: Record<string, unknown>,
          ) => number;
        }
      ).lexicalScore('de la', {
        normalizedText: 'contenido',
        clinicalTags: [],
        symptoms: [],
        redFlags: [],
        drugNames: [],
      }),
    ).toBe(0);
    expect(
      (
        service as unknown as {
          cosineSimilarity: (left: number[], right: number[]) => number;
        }
      ).cosineSimilarity([], [1]),
    ).toBe(0);
    expect(
      (
        service as unknown as {
          cosineSimilarity: (left: number[], right: number[]) => number;
        }
      ).cosineSimilarity([0, 0], [0, 0]),
    ).toBe(0);
    expect(
      (
        service as unknown as {
          buildSnippet: (text: string, normalizedQuery: string) => string;
        }
      ).buildSnippet(veryLongText, 'dolor pecho'),
    ).toBe(`${veryLongText.slice(0, 277)}...`);
  });
});
