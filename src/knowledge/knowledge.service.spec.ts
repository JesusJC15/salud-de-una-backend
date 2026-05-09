import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { AiService } from '../ai/ai.service';
import { DoctorStatus } from '../common/enums/doctor-status.enum';
import { Specialty } from '../common/enums/specialty.enum';
import { UserRole } from '../common/enums/user-role.enum';
import type { RequestUser } from '../common/interfaces/request-user.interface';
import { KnowledgeStorageService } from './knowledge-storage.service';
import { KnowledgeService } from './knowledge.service';

function createQueryMock<T>(initialValue: T) {
  return {
    lean: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    exec: jest.fn<Promise<T>, []>().mockResolvedValue(initialValue),
  };
}

describe('KnowledgeService', () => {
  const adminActor: RequestUser = {
    userId: 'admin-1',
    email: 'admin@example.com',
    role: UserRole.ADMIN,
    isActive: true,
  };
  const doctorActor: RequestUser = {
    userId: 'doctor-1',
    email: 'doctor@example.com',
    role: UserRole.DOCTOR,
    isActive: true,
  };

  const sourceListQuery = createQueryMock<unknown[]>([]);
  const sourceByIdQuery = createQueryMock<unknown | null>(null);
  const sourceUpdateQuery = createQueryMock<unknown | null>(null);
  const documentListQuery = createQueryMock<unknown[]>([]);
  const documentByIdQuery = createQueryMock<unknown | null>(null);
  const chunkFindQuery = createQueryMock<unknown[]>([]);
  const reviewFindQuery = createQueryMock<unknown[]>([]);
  const jobFindQuery = createQueryMock<unknown[]>([]);
  const doctorByIdQuery = createQueryMock<unknown | null>(null);

  const doctorModel = {
    findById: jest.fn(() => doctorByIdQuery),
  };
  const sourceModel = {
    find: jest.fn(() => sourceListQuery),
    findById: jest.fn(() => sourceByIdQuery),
    findByIdAndUpdate: jest.fn(() => sourceUpdateQuery),
    create: jest.fn(),
  };
  const documentModel = {
    find: jest.fn(() => documentListQuery),
    findById: jest.fn(() => documentByIdQuery),
    create: jest.fn(),
  };
  const documentVersionModel = {
    deleteMany: jest.fn(),
    create: jest.fn(),
  };
  const chunkModel = {
    find: jest.fn(() => chunkFindQuery),
    deleteMany: jest.fn(),
    insertMany: jest.fn(),
    updateMany: jest.fn(),
  };
  const reviewModel = {
    find: jest.fn(() => reviewFindQuery),
    create: jest.fn(),
  };
  const jobModel = {
    find: jest.fn(() => jobFindQuery),
    create: jest.fn(),
    updateOne: jest.fn(),
  };
  const storageService = {
    saveFile: jest.fn(),
  };
  const aiService = {
    embedTexts: jest.fn(),
  };
  const configService = {
    get: jest.fn(),
  };
  const redisClient = {
    keys: jest.fn(),
    del: jest.fn(),
  };

  function createService(redis: typeof redisClient | null = redisClient) {
    return new KnowledgeService(
      doctorModel as never,
      sourceModel as never,
      documentModel as never,
      documentVersionModel as never,
      chunkModel as never,
      reviewModel as never,
      jobModel as never,
      storageService as never,
      aiService as never,
      configService as never as ConfigService,
      redis as never,
    );
  }

  function buildDocumentDoc(overrides: Record<string, unknown> = {}) {
    return {
      _id: new Types.ObjectId(),
      sourceId: undefined,
      title: 'Guía clínica',
      authority: 'MSPS',
      sourceType: 'GUIDELINE',
      status: 'PROCESSING',
      country: 'CO',
      specialty: Specialty.GENERAL_MEDICINE,
      clinicalTags: ['dolor'],
      symptoms: ['dolor'],
      redFlags: ['alarma'],
      drugNames: ['acetaminofen'],
      audience: 'STAFF',
      useCases: ['TRIAGE'],
      language: 'es',
      originalFileName: 'guia.txt',
      mimeType: 'text/plain',
      sourceUrl: undefined,
      extractedText: 'Texto inicial',
      extractionMethod: 'inline_text',
      storageFileId: undefined,
      contentHash: 'hash-1',
      validFrom: undefined,
      validUntil: undefined,
      currentVersion: 1,
      currentVersionId: undefined,
      sourceQualityTier: 100,
      tenantId: null,
      reviewedAt: undefined,
      approvedBy: undefined,
      ingestionError: undefined,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-02T00:00:00.000Z'),
      save: jest.fn().mockResolvedValue(undefined),
      toObject: jest.fn().mockReturnValue({ id: 'doc-1' }),
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();

    sourceListQuery.exec.mockResolvedValue([]);
    sourceByIdQuery.exec.mockResolvedValue(null);
    sourceUpdateQuery.exec.mockResolvedValue(null);
    documentListQuery.exec.mockResolvedValue([]);
    documentByIdQuery.exec.mockResolvedValue(null);
    chunkFindQuery.exec.mockResolvedValue([]);
    reviewFindQuery.exec.mockResolvedValue([]);
    jobFindQuery.exec.mockResolvedValue([]);
    doctorByIdQuery.exec.mockResolvedValue(null);

    sourceModel.create.mockResolvedValue({
      toObject: () => ({ id: 'source-1' }),
    });
    documentModel.create.mockResolvedValue(buildDocumentDoc());
    documentVersionModel.deleteMany.mockResolvedValue({ deletedCount: 0 });
    documentVersionModel.create.mockResolvedValue({
      _id: new Types.ObjectId(),
      version: 1,
    });
    chunkModel.deleteMany.mockResolvedValue({ deletedCount: 0 });
    chunkModel.insertMany.mockResolvedValue([]);
    chunkModel.updateMany.mockResolvedValue({ modifiedCount: 0 });
    reviewModel.create.mockResolvedValue({});
    jobModel.create.mockResolvedValue({ _id: new Types.ObjectId() });
    jobModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
    storageService.saveFile.mockResolvedValue(new Types.ObjectId());
    aiService.embedTexts.mockResolvedValue({
      provider: 'gemini',
      model: 'gemini-embedding-001',
      embeddings: [[0.1, 0.2]],
      latencyMs: 10,
      requestId: 'embed-1',
    });
    configService.get.mockImplementation((key: string) => {
      const values: Record<string, unknown> = {
        'rag.embeddingModel': 'gemini-embedding-001',
        'rag.embeddingDimensions': 2,
      };
      return values[key];
    });
    redisClient.keys.mockResolvedValue([]);
    redisClient.del.mockResolvedValue(0);
  });

  it('listSources should return the sorted query result', async () => {
    const service = createService();
    sourceListQuery.exec.mockResolvedValue([{ name: 'INS' }]);

    await expect(service.listSources()).resolves.toEqual([{ name: 'INS' }]);
    expect(sourceListQuery.sort).toHaveBeenCalledWith({
      authorityWeight: -1,
      name: 1,
    });
  });

  it('createSource should apply repository defaults', async () => {
    const service = createService();

    await service.createSource({
      name: 'Guías nacionales',
      country: undefined,
      authorityWeight: undefined,
      allowUrlIngest: undefined,
      isGlobalFallback: undefined,
      url: 'https://example.com',
    } as never);

    expect(sourceModel.create).toHaveBeenCalledWith({
      name: 'Guías nacionales',
      country: 'CO',
      authorityWeight: 100,
      allowUrlIngest: true,
      isGlobalFallback: false,
      url: 'https://example.com',
      status: 'ACTIVE',
    });
  });

  it('updateSource should return the updated source and throw when not found', async () => {
    const service = createService();

    sourceUpdateQuery.exec.mockResolvedValueOnce({
      _id: 'source-1',
      name: 'Fuente actualizada',
    });

    await expect(
      service.updateSource('source-1', { name: 'Fuente actualizada' }),
    ).resolves.toEqual({
      _id: 'source-1',
      name: 'Fuente actualizada',
    });

    sourceUpdateQuery.exec.mockResolvedValueOnce(null);

    await expect(
      service.updateSource('missing', { name: 'Otra' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('listDocuments should build filters and map response fields', async () => {
    const service = createService();
    const sourceId = new Types.ObjectId();
    const documentId = new Types.ObjectId();

    documentListQuery.exec.mockResolvedValue([
      {
        _id: documentId,
        sourceId,
        title: 'Documento',
        authority: 'MSPS',
        sourceType: 'GUIDELINE',
        status: 'APPROVED',
        country: 'CO',
        specialty: Specialty.GENERAL_MEDICINE,
        audience: 'STAFF',
        useCases: ['TRIAGE'],
        language: 'es',
        originalFileName: 'doc.txt',
        mimeType: 'text/plain',
        sourceUrl: 'https://example.com',
        currentVersion: 3,
        reviewedAt: new Date('2025-01-01T00:00:00.000Z'),
        approvedBy: 'doctor-1',
        ingestionError: null,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-02T00:00:00.000Z'),
      },
    ]);

    const result = await service.listDocuments({
      status: 'APPROVED',
      specialty: Specialty.GENERAL_MEDICINE,
      sourceId: sourceId.toString(),
    });

    expect(documentModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'APPROVED',
        specialty: Specialty.GENERAL_MEDICINE,
        sourceId: expect.any(Types.ObjectId),
      }),
    );
    expect(result).toEqual({
      items: [
        expect.objectContaining({
          id: documentId.toString(),
          sourceId: sourceId.toString(),
          title: 'Documento',
          currentVersion: 3,
        }),
      ],
      total: 1,
    });
  });

  it('getDocument should throw when missing and include mapped reviews when found', async () => {
    const service = createService();
    const document = buildDocumentDoc({
      _id: new Types.ObjectId(),
      status: 'READY_FOR_REVIEW',
    });

    documentByIdQuery.exec.mockResolvedValueOnce(null);
    await expect(service.getDocument('missing')).rejects.toThrow(
      NotFoundException,
    );

    documentByIdQuery.exec.mockResolvedValueOnce(document);
    reviewFindQuery.exec.mockResolvedValue([
      {
        _id: new Types.ObjectId(),
        reviewerId: 'doctor-1',
        reviewerRole: UserRole.DOCTOR,
        status: 'APPROVED',
        notes: 'Listo',
        createdAt: new Date('2025-01-03T00:00:00.000Z'),
      },
    ]);

    const result = await service.getDocument(document._id.toString());

    expect(result.reviews).toEqual([
      {
        id: expect.any(String),
        reviewerId: 'doctor-1',
        reviewerRole: UserRole.DOCTOR,
        status: 'APPROVED',
        notes: 'Listo',
        createdAt: '2025-01-03T00:00:00.000Z',
      },
    ]);
  });

  it('getDocumentChunks and listJobs should map persisted records', async () => {
    const service = createService();
    const documentId = new Types.ObjectId();

    documentByIdQuery.exec.mockResolvedValue({
      _id: documentId,
    });
    chunkFindQuery.exec.mockResolvedValue([
      {
        _id: new Types.ObjectId(),
        chunkIndex: 0,
        sectionPath: 'General',
        text: 'Contenido',
        reviewStatus: 'APPROVED',
        embeddingDimensions: 2,
        updatedAt: new Date('2025-01-04T00:00:00.000Z'),
      },
    ]);
    jobFindQuery.exec.mockResolvedValue([
      {
        _id: new Types.ObjectId(),
        type: 'INGESTION',
        status: 'COMPLETED',
        documentId,
        sourceId: new Types.ObjectId(),
        durationMs: 45,
        errorMessage: undefined,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-01T00:00:45.000Z'),
      },
    ]);

    await expect(
      service.getDocumentChunks(documentId.toString()),
    ).resolves.toEqual({
      items: [
        {
          id: expect.any(String),
          chunkIndex: 0,
          sectionPath: 'General',
          text: 'Contenido',
          reviewStatus: 'APPROVED',
          embeddingDimensions: 2,
          updatedAt: '2025-01-04T00:00:00.000Z',
        },
      ],
      total: 1,
    });
    await expect(service.listJobs()).resolves.toEqual({
      items: [
        expect.objectContaining({
          type: 'INGESTION',
          status: 'COMPLETED',
          durationMs: 45,
        }),
      ],
      total: 1,
    });
  });

  it('getDocumentChunks should throw when the document does not exist', async () => {
    const service = createService();

    documentByIdQuery.exec.mockResolvedValueOnce(null);

    await expect(service.getDocumentChunks('missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('ingestUploadedDocument should reject when neither file nor text is provided', async () => {
    const service = createService();

    await expect(
      service.ingestUploadedDocument(
        {
          title: 'Guía',
          authority: 'MSPS',
          sourceType: 'GUIDELINE',
          specialty: Specialty.GENERAL_MEDICINE,
        } as never,
        adminActor,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('ingestUploadedDocument should ingest inline text, rebuild chunks and invalidate cache', async () => {
    const service = createService();
    const document = buildDocumentDoc();

    documentModel.create.mockResolvedValue(document);
    documentByIdQuery.exec.mockResolvedValue(document);
    reviewFindQuery.exec.mockResolvedValue([]);
    redisClient.keys.mockResolvedValue([
      'salud-de-una:rag:a',
      'salud-de-una:rag:b',
    ]);

    const result = await service.ingestUploadedDocument(
      {
        title: 'Guía clínica',
        authority: 'MSPS',
        sourceType: 'GUIDELINE',
        specialty: Specialty.GENERAL_MEDICINE,
        clinicalTags: 'dolor,triaje',
        symptoms: 'dolor',
        redFlags: 'alarma',
        drugNames: 'acetaminofen',
        audience: 'STAFF',
        useCases: 'TRIAGE,INVALIDO',
        contentText: 'Primer párrafo.\n\nSegundo párrafo.',
      } as never,
      adminActor,
      'corr-inline',
    );

    expect(aiService.embedTexts).toHaveBeenCalledWith({
      model: 'gemini-embedding-001',
      contents: ['Primer párrafo.\n\nSegundo párrafo.'],
      taskType: 'RETRIEVAL_DOCUMENT',
      outputDimensionality: 2,
    });
    expect(chunkModel.insertMany).toHaveBeenCalledTimes(1);
    expect(jobModel.updateOne).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'COMPLETED',
        }),
      }),
    );
    expect(redisClient.del).toHaveBeenCalledWith([
      'salud-de-una:rag:a',
      'salud-de-una:rag:b',
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        id: document._id.toString(),
        title: 'Guía clínica',
      }),
    );
  });

  it('ingestUploadedDocument should save uploaded files and strip HTML before embedding', async () => {
    const service = createService();
    const document = buildDocumentDoc();

    documentModel.create.mockResolvedValue(document);
    documentByIdQuery.exec.mockResolvedValue(document);

    await service.ingestUploadedDocument(
      {
        title: 'Documento HTML',
        authority: 'MSPS',
        sourceType: 'FAQ',
        specialty: Specialty.GENERAL_MEDICINE,
      } as never,
      adminActor,
      'corr-file',
      {
        originalname: 'doc.html',
        mimetype: 'text/html',
        buffer: Buffer.from(
          '<h1>Guía</h1><script>alert(1)</script><p>Texto útil</p>',
        ),
      },
    );

    expect(storageService.saveFile).toHaveBeenCalledWith(
      'doc.html',
      'text/html',
      expect.any(Buffer),
    );
    expect(aiService.embedTexts).toHaveBeenCalledWith(
      expect.objectContaining({
        contents: ['Guía Texto útil'],
      }),
    );
  });

  it('ingestUploadedDocument should mark document and job as failed when embedding fails', async () => {
    const service = createService();
    const document = buildDocumentDoc();

    documentModel.create.mockResolvedValue(document);
    aiService.embedTexts.mockRejectedValueOnce(new Error('embedding failed'));

    await expect(
      service.ingestUploadedDocument(
        {
          title: 'Guía',
          authority: 'MSPS',
          sourceType: 'GUIDELINE',
          specialty: Specialty.GENERAL_MEDICINE,
          contentText: 'Texto base',
        } as never,
        adminActor,
        'corr-fail',
      ),
    ).rejects.toThrow('embedding failed');

    expect(document.status).toBe('FAILED');
    expect(document.ingestionError).toBe('embedding failed');
    expect(document.save).toHaveBeenCalled();
    expect(jobModel.updateOne).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'FAILED',
          errorMessage: 'embedding failed',
        }),
      }),
    );
  });

  it('ingestDocumentFromUrl should reject when the configured source forbids url ingest', async () => {
    const service = createService();
    const sourceId = new Types.ObjectId();

    sourceByIdQuery.exec.mockResolvedValue({
      _id: sourceId,
      allowUrlIngest: false,
    });

    await expect(
      service.ingestDocumentFromUrl(
        {
          sourceId: sourceId.toString(),
          title: 'Documento',
          authority: 'MSPS',
          sourceType: 'GUIDELINE',
          specialty: Specialty.GENERAL_MEDICINE,
          sourceUrl: 'https://example.com/doc',
        } as never,
        adminActor,
        'corr-url',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('ingestDocumentFromUrl should fetch remote content and persist a document', async () => {
    const service = createService();
    const document = buildDocumentDoc({
      title: 'Documento remoto',
      sourceUrl: 'https://example.com/doc',
    });
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      headers: { get: () => 'text/plain' },
      arrayBuffer: async () => Buffer.from('Texto remoto'),
    } as never);

    documentModel.create.mockResolvedValue(document);
    documentByIdQuery.exec.mockResolvedValue(document);

    const result = await service.ingestDocumentFromUrl(
      {
        title: 'Documento remoto',
        authority: 'MSPS',
        sourceType: 'GUIDELINE',
        specialty: Specialty.GENERAL_MEDICINE,
        sourceUrl: 'https://example.com/doc',
      } as never,
      adminActor,
      'corr-url-success',
    );

    expect(fetchSpy).toHaveBeenCalledWith('https://example.com/doc');
    expect(result.title).toBe('Documento remoto');
  });

  it('ingestDocumentFromUrl should fail fast when the remote response is not ok', async () => {
    const service = createService();
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 502,
    } as never);

    await expect(
      service.ingestDocumentFromUrl(
        {
          title: 'Documento remoto',
          authority: 'MSPS',
          sourceType: 'GUIDELINE',
          specialty: Specialty.GENERAL_MEDICINE,
          sourceUrl: 'https://example.com/doc',
        } as never,
        adminActor,
        'corr-url-error',
      ),
    ).rejects.toThrow(BadRequestException);

    expect(fetchSpy).toHaveBeenCalledWith('https://example.com/doc');
  });

  it('reprocessDocument should reject missing documents or missing extracted text', async () => {
    const service = createService();

    documentByIdQuery.exec.mockResolvedValueOnce(null);
    await expect(
      service.reprocessDocument('missing', adminActor, 'corr-reprocess'),
    ).rejects.toThrow(NotFoundException);

    documentByIdQuery.exec.mockResolvedValueOnce(
      buildDocumentDoc({ extractedText: '   ' }),
    );
    await expect(
      service.reprocessDocument('doc-1', adminActor, 'corr-reprocess'),
    ).rejects.toThrow(BadRequestException);
  });

  it('reprocessDocument should rebuild the document and return it even without redis configured', async () => {
    const service = createService(null);
    const document = buildDocumentDoc({
      extractedText: 'Contenido reprocesable',
    });

    documentByIdQuery.exec.mockResolvedValueOnce(document);
    documentByIdQuery.exec.mockResolvedValueOnce(document);
    reviewFindQuery.exec.mockResolvedValue([]);

    const result = await service.reprocessDocument(
      document._id.toString(),
      adminActor,
      'corr-reprocess-success',
    );

    expect(document.status).toBe('READY_FOR_REVIEW');
    expect(jobModel.updateOne).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'COMPLETED',
        }),
      }),
    );
    expect(result.id).toBe(document._id.toString());
  });

  it('reprocessDocument should mark the job as failed when rebuilding throws', async () => {
    const service = createService();
    const document = buildDocumentDoc({
      extractedText: 'Contenido reprocesable',
    });

    documentByIdQuery.exec.mockResolvedValueOnce(document);
    aiService.embedTexts.mockRejectedValueOnce(new Error('embed reproceso'));

    await expect(
      service.reprocessDocument(
        document._id.toString(),
        adminActor,
        'corr-reprocess-fail',
      ),
    ).rejects.toThrow('embed reproceso');

    expect(jobModel.updateOne).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'FAILED',
          errorMessage: 'embed reproceso',
        }),
      }),
    );
  });

  it('reviewDocument should enforce approver rules and update chunks on success', async () => {
    const service = createService();
    const document = buildDocumentDoc({
      status: 'READY_FOR_REVIEW',
    });

    documentByIdQuery.exec.mockResolvedValueOnce(document);
    await expect(
      service.reviewDocument(
        document._id.toString(),
        { status: 'APPROVED' } as never,
        adminActor,
      ),
    ).rejects.toThrow(ForbiddenException);

    documentByIdQuery.exec.mockResolvedValueOnce(document);
    doctorByIdQuery.exec.mockResolvedValueOnce({
      doctorStatus: DoctorStatus.PENDING,
    });
    await expect(
      service.reviewDocument(
        document._id.toString(),
        { status: 'APPROVED' } as never,
        doctorActor,
      ),
    ).rejects.toThrow(ForbiddenException);

    documentByIdQuery.exec.mockResolvedValueOnce(document);
    doctorByIdQuery.exec.mockResolvedValueOnce({
      doctorStatus: DoctorStatus.VERIFIED,
    });
    documentByIdQuery.exec.mockResolvedValueOnce(document);
    reviewFindQuery.exec.mockResolvedValue([]);

    const result = await service.reviewDocument(
      document._id.toString(),
      { status: 'APPROVED', notes: 'Verificado' } as never,
      doctorActor,
    );

    expect(chunkModel.updateMany).toHaveBeenCalledWith(
      { documentId: document._id },
      { $set: { reviewStatus: 'APPROVED' } },
    );
    expect(reviewModel.create).toHaveBeenCalledWith({
      documentId: document._id,
      reviewerId: doctorActor.userId,
      reviewerRole: doctorActor.role,
      status: 'APPROVED',
      notes: 'Verificado',
    });
    expect(result.id).toBe(document._id.toString());
  });

  it('reviewDocument should throw when the requested document does not exist', async () => {
    const service = createService();

    documentByIdQuery.exec.mockResolvedValueOnce(null);

    await expect(
      service.reviewDocument(
        'missing',
        { status: 'APPROVED' } as never,
        doctorActor,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('ingestUploadedDocument should reject invalid and unknown source ids', async () => {
    const service = createService();
    const sourceId = new Types.ObjectId();

    await expect(
      service.ingestUploadedDocument(
        {
          sourceId: 'invalid-source-id',
          title: 'Guía',
          authority: 'MSPS',
          sourceType: 'GUIDELINE',
          specialty: Specialty.GENERAL_MEDICINE,
          contentText: 'Texto base',
        } as never,
        adminActor,
      ),
    ).rejects.toThrow(BadRequestException);

    sourceByIdQuery.exec.mockResolvedValueOnce(null);
    await expect(
      service.ingestUploadedDocument(
        {
          sourceId: sourceId.toString(),
          title: 'Guía',
          authority: 'MSPS',
          sourceType: 'GUIDELINE',
          specialty: Specialty.GENERAL_MEDICINE,
          contentText: 'Texto base',
        } as never,
        adminActor,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('ingestUploadedDocument should reject PDFs without extractable text', async () => {
    const service = createService();

    await expect(
      service.ingestUploadedDocument(
        {
          title: 'PDF escaneado',
          authority: 'MSPS',
          sourceType: 'GUIDELINE',
          specialty: Specialty.GENERAL_MEDICINE,
        } as never,
        adminActor,
        'corr-pdf',
        {
          originalname: 'scan.pdf',
          mimetype: 'application/pdf',
          buffer: Buffer.from('%PDF-1.4 without text'),
        },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('ingestUploadedDocument should parse extractable PDF text streams', async () => {
    const service = createService();
    const document = buildDocumentDoc({
      title: 'PDF digital',
    });

    documentModel.create.mockResolvedValue(document);
    documentByIdQuery.exec.mockResolvedValue(document);
    reviewFindQuery.exec.mockResolvedValue([]);

    await expect(
      service.ingestUploadedDocument(
        {
          title: 'PDF digital',
          authority: 'MSPS',
          sourceType: 'GUIDELINE',
          specialty: Specialty.GENERAL_MEDICINE,
        } as never,
        adminActor,
        'corr-pdf-ok',
        {
          originalname: 'digital.pdf',
          mimetype: 'application/pdf',
          buffer: Buffer.from('(Linea\\nuno) (Texto\\(dos\\))', 'latin1'),
        },
      ),
    ).resolves.toMatchObject({
      title: 'PDF digital',
    });

    expect(aiService.embedTexts).toHaveBeenCalledWith(
      expect.objectContaining({
        contents: ['Linea\nuno Texto(dos)'],
      }),
    );
  });

  it('ingestUploadedDocument should use binary utf8 fallback for unknown mime types', async () => {
    const service = createService();
    const document = buildDocumentDoc({
      title: 'Binario',
    });

    documentModel.create.mockResolvedValue(document);
    documentByIdQuery.exec.mockResolvedValue(document);
    reviewFindQuery.exec.mockResolvedValue([]);

    await expect(
      service.ingestUploadedDocument(
        {
          title: 'Binario',
          authority: 'MSPS',
          sourceType: 'GUIDELINE',
          specialty: Specialty.GENERAL_MEDICINE,
        } as never,
        adminActor,
        'corr-binary',
        {
          originalname: 'doc.bin',
          mimetype: 'application/octet-stream',
          buffer: Buffer.from('contenido binario'),
        },
      ),
    ).resolves.toMatchObject({
      title: 'Binario',
    });

    expect(aiService.embedTexts).toHaveBeenCalledWith(
      expect.objectContaining({
        contents: ['contenido binario'],
      }),
    );
  });

  it('ingestUploadedDocument should reject documents without useful normalized text', async () => {
    const service = createService();

    await expect(
      service.ingestUploadedDocument(
        {
          title: 'HTML vacío',
          authority: 'MSPS',
          sourceType: 'FAQ',
          specialty: Specialty.GENERAL_MEDICINE,
        } as never,
        adminActor,
        'corr-empty',
        {
          originalname: 'empty.html',
          mimetype: 'text/html',
          buffer: Buffer.from('<style>body{}</style><script>noop()</script>'),
        },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('helper methods should handle missing files and chunk edge cases', async () => {
    const service = createService();
    const privateApi = service as unknown as {
      extractUploadedContent: (
        dto: Record<string, unknown>,
        file?: unknown,
      ) => Promise<unknown>;
      chunkDocument: (rawText: string, sourceType: string) => unknown[];
    };

    await expect(
      privateApi.extractUploadedContent(
        {
          title: 'Guía',
        },
        undefined,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(privateApi.chunkDocument('   ', 'GUIDELINE')).toEqual([]);

    const chunks = privateApi.chunkDocument(
      `${'A'.repeat(1200)}\n\n${'B'.repeat(1200)}\n\n${'C'.repeat(1200)}`,
      'FAQ',
    );
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('ingestUploadedDocument should ignore redis key lookup failures during cache invalidation', async () => {
    const service = createService();
    const document = buildDocumentDoc();

    documentModel.create.mockResolvedValue(document);
    documentByIdQuery.exec.mockResolvedValue(document);
    reviewFindQuery.exec.mockResolvedValue([]);
    redisClient.keys.mockRejectedValueOnce(new Error('keys unavailable'));

    await expect(
      service.ingestUploadedDocument(
        {
          title: 'Guía clínica',
          authority: 'MSPS',
          sourceType: 'GUIDELINE',
          specialty: Specialty.GENERAL_MEDICINE,
          contentText: 'Texto con caché',
        } as never,
        adminActor,
        'corr-redis-keys',
      ),
    ).resolves.toMatchObject({
      id: document._id.toString(),
    });

    expect(redisClient.del).not.toHaveBeenCalled();
  });

  it('getApprovedCorpusVersion should return empty when there is no approved document and the latest version otherwise', async () => {
    const service = createService();
    const approvedId = new Types.ObjectId();

    documentListQuery.exec.mockResolvedValueOnce([]);
    await expect(service.getApprovedCorpusVersion()).resolves.toBe('empty');

    documentListQuery.exec.mockResolvedValueOnce([
      {
        _id: approvedId,
        updatedAt: new Date('2025-01-06T00:00:00.000Z'),
      },
    ]);
    await expect(service.getApprovedCorpusVersion()).resolves.toBe(
      `${approvedId.toString()}:2025-01-06T00:00:00.000Z`,
    );
  });
});
