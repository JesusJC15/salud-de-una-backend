import { createHash } from 'crypto';
import { extname } from 'path';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import Redis from 'ioredis';
import { AiService } from '../ai/ai.service';
import { fetchWithTimeout } from '../common/utils/fetch.util';
import { DoctorStatus } from '../common/enums/doctor-status.enum';
import { Specialty } from '../common/enums/specialty.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { RequestUser } from '../common/interfaces/request-user.interface';
import { Doctor, DoctorDocument } from '../doctors/schemas/doctor.schema';
import { REDIS_CLIENT } from '../redis/redis.constants';
import {
  IngestDocumentDto,
  IngestDocumentUrlDto,
} from './dto/ingest-document.dto';
import { CreateKnowledgeSourceDto } from './dto/create-knowledge-source.dto';
import { ListKnowledgeDocumentsDto } from './dto/list-knowledge-documents.dto';
import { ReviewKnowledgeDocumentDto } from './dto/review-knowledge-document.dto';
import { UpdateKnowledgeSourceDto } from './dto/update-knowledge-source.dto';
import {
  KNOWLEDGE_JOB_TYPES,
  KNOWLEDGE_USE_CASES,
  type KnowledgeAudience,
  type KnowledgeUseCase,
} from './knowledge.constants';
import {
  KnowledgeChunk,
  KnowledgeChunkDocument,
} from './schemas/knowledge-chunk.schema';
import {
  KnowledgeDocument,
  KnowledgeDocumentDocument,
} from './schemas/knowledge-document.schema';
import {
  KnowledgeDocumentVersion,
  KnowledgeDocumentVersionDocument,
} from './schemas/knowledge-document-version.schema';
import {
  KnowledgeJob,
  KnowledgeJobDocument,
} from './schemas/knowledge-job.schema';
import {
  KnowledgeReview,
  KnowledgeReviewDocument,
} from './schemas/knowledge-review.schema';
import {
  KnowledgeSource,
  KnowledgeSourceDocument,
} from './schemas/knowledge-source.schema';
import { KnowledgeStorageService } from './knowledge-storage.service';

type ParsedMetadata = {
  sourceId?: Types.ObjectId;
  title: string;
  authority: string;
  sourceType: KnowledgeDocument['sourceType'];
  specialty: Specialty;
  country: string;
  clinicalTags: string[];
  symptoms: string[];
  redFlags: string[];
  drugNames: string[];
  audience: KnowledgeAudience;
  useCases: KnowledgeUseCase[];
  language: string;
  validFrom?: Date;
  validUntil?: Date;
};

type ChunkPayload = {
  sectionPath: string;
  text: string;
};

type UploadedKnowledgeFile = {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
};

type DocumentResponseSource = {
  _id: Types.ObjectId;
  sourceId?: Types.ObjectId | null;
  title: string;
  authority: string;
  sourceType: string;
  status: string;
  country: string;
  specialty: Specialty;
  audience: KnowledgeAudience;
  useCases: KnowledgeUseCase[];
  language: string;
  originalFileName?: string | null;
  mimeType?: string | null;
  sourceUrl?: string | null;
  currentVersion: number;
  reviewedAt?: Date | null;
  approvedBy?: string | null;
  ingestionError?: string | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
};

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    @InjectModel(Doctor.name)
    private readonly doctorModel: Model<DoctorDocument>,
    @InjectModel(KnowledgeSource.name)
    private readonly sourceModel: Model<KnowledgeSourceDocument>,
    @InjectModel(KnowledgeDocument.name)
    private readonly documentModel: Model<KnowledgeDocumentDocument>,
    @InjectModel(KnowledgeDocumentVersion.name)
    private readonly documentVersionModel: Model<KnowledgeDocumentVersionDocument>,
    @InjectModel(KnowledgeChunk.name)
    private readonly chunkModel: Model<KnowledgeChunkDocument>,
    @InjectModel(KnowledgeReview.name)
    private readonly reviewModel: Model<KnowledgeReviewDocument>,
    @InjectModel(KnowledgeJob.name)
    private readonly jobModel: Model<KnowledgeJobDocument>,
    private readonly storageService: KnowledgeStorageService,
    private readonly aiService: AiService,
    private readonly configService: ConfigService,
    @Inject(REDIS_CLIENT)
    private readonly redisClient: Redis | null,
  ) {}

  async listSources() {
    return this.sourceModel
      .find()
      .sort({ authorityWeight: -1, name: 1 })
      .lean()
      .exec();
  }

  async createSource(dto: CreateKnowledgeSourceDto) {
    const source = await this.sourceModel.create({
      ...dto,
      country: dto.country ?? 'CO',
      allowUrlIngest: dto.allowUrlIngest ?? true,
      authorityWeight: dto.authorityWeight ?? 100,
      isGlobalFallback: dto.isGlobalFallback ?? false,
      status: 'ACTIVE',
    });

    return source.toObject();
  }

  async updateSource(sourceId: string, dto: UpdateKnowledgeSourceDto) {
    const source = await this.sourceModel
      .findByIdAndUpdate(sourceId, { $set: dto }, { new: true })
      .lean()
      .exec();

    if (!source) {
      throw new NotFoundException('Fuente de conocimiento no encontrada');
    }

    return source;
  }

  async listDocuments(query: ListKnowledgeDocumentsDto) {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.specialty) filter.specialty = query.specialty;
    if (query.sourceId && Types.ObjectId.isValid(query.sourceId)) {
      filter.sourceId = new Types.ObjectId(query.sourceId);
    }

    const items = await this.documentModel
      .find(filter)
      .sort({ updatedAt: -1 })
      .lean()
      .exec();

    return {
      items: items.map((item) => this.toDocumentResponse(item)),
      total: items.length,
    };
  }

  async getDocument(documentId: string) {
    const document = await this.documentModel
      .findById(documentId)
      .lean()
      .exec();
    if (!document) {
      throw new NotFoundException('Documento de conocimiento no encontrado');
    }

    const reviews = await this.reviewModel
      .find({ documentId: document._id })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return {
      ...this.toDocumentResponse(document),
      reviews: reviews.map((review) => ({
        id: review._id.toString(),
        reviewerId: review.reviewerId,
        reviewerRole: review.reviewerRole,
        status: review.status,
        notes: review.notes ?? null,
        createdAt: review.createdAt?.toISOString() ?? null,
      })),
    };
  }

  async getDocumentChunks(documentId: string) {
    const document = await this.documentModel
      .findById(documentId)
      .lean()
      .exec();
    if (!document) {
      throw new NotFoundException('Documento de conocimiento no encontrado');
    }

    const chunks = await this.chunkModel
      .find({
        documentId: document._id,
        documentVersionId: document.currentVersionId,
      })
      .sort({ chunkIndex: 1 })
      .lean()
      .exec();

    return {
      items: chunks.map((chunk) => ({
        id: chunk._id.toString(),
        chunkIndex: chunk.chunkIndex,
        sectionPath: chunk.sectionPath,
        text: chunk.text,
        reviewStatus: chunk.reviewStatus,
        embeddingDimensions: chunk.embeddingDimensions,
        updatedAt: chunk.updatedAt?.toISOString() ?? null,
      })),
      total: chunks.length,
    };
  }

  async listJobs() {
    const items = await this.jobModel
      .find()
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()
      .exec();
    return {
      items: items.map((item) => ({
        id: item._id.toString(),
        type: item.type,
        status: item.status,
        documentId: item.documentId?.toString() ?? null,
        sourceId: item.sourceId?.toString() ?? null,
        durationMs: item.durationMs,
        errorMessage: item.errorMessage ?? null,
        createdAt: item.createdAt?.toISOString() ?? null,
        updatedAt: item.updatedAt?.toISOString() ?? null,
      })),
      total: items.length,
    };
  }

  async ingestUploadedDocument(
    dto: IngestDocumentDto,
    actor: RequestUser,
    correlationId?: string,
    file?: UploadedKnowledgeFile,
  ) {
    const metadata = await this.parseMetadata(dto);
    if (!file && !dto.contentText?.trim()) {
      throw new BadRequestException(
        'Debes enviar un archivo o contenido textual para la ingesta',
      );
    }

    const job = await this.createJob('INGESTION', actor, correlationId, {
      title: dto.title,
      specialty: dto.specialty,
      sourceType: dto.sourceType,
    });
    const startedAt = Date.now();

    try {
      const {
        text,
        storageFileId,
        mimeType,
        originalFileName,
        extractionMethod,
      } = await this.extractUploadedContent(dto, file);
      const document = await this.createOrReplaceDocument({
        metadata,
        actor,
        correlationId,
        text,
        storageFileId,
        mimeType,
        originalFileName,
        sourceUrl: undefined,
        extractionMethod,
      });

      await this.completeJob(job._id, 'COMPLETED', startedAt);
      return this.getDocument(document._id.toString());
    } catch (error: unknown) {
      await this.completeJob(
        job._id,
        'FAILED',
        startedAt,
        this.toErrorMessage(error),
      );
      throw error;
    }
  }

  async ingestDocumentFromUrl(
    dto: IngestDocumentUrlDto,
    actor: RequestUser,
    correlationId?: string,
  ) {
    const metadata = await this.parseMetadata(dto);
    const job = await this.createJob('INGESTION', actor, correlationId, {
      title: dto.title,
      sourceUrl: dto.sourceUrl,
    });
    const startedAt = Date.now();

    try {
      const source = metadata.sourceId
        ? await this.sourceModel.findById(metadata.sourceId).lean().exec()
        : null;

      if (source && source.allowUrlIngest === false) {
        throw new BadRequestException(
          'La fuente configurada no permite ingesta por URL',
        );
      }

      const { mimeType, buffer } = await this.downloadUrlDocument(
        dto.sourceUrl,
      );
      const extracted = this.extractTextFromBuffer(buffer, mimeType);

      const document = await this.createOrReplaceDocument({
        metadata,
        actor,
        correlationId,
        text: extracted.text,
        storageFileId: undefined,
        mimeType,
        originalFileName: dto.title,
        sourceUrl: dto.sourceUrl,
        extractionMethod: extracted.extractionMethod,
      });

      await this.completeJob(job._id, 'COMPLETED', startedAt);
      return this.getDocument(document._id.toString());
    } catch (error: unknown) {
      await this.completeJob(
        job._id,
        'FAILED',
        startedAt,
        this.toErrorMessage(error),
      );
      throw error;
    }
  }

  async reprocessDocument(
    documentId: string,
    actor: RequestUser,
    correlationId?: string,
  ) {
    const document = await this.documentModel.findById(documentId).exec();
    if (!document) {
      throw new NotFoundException('Documento de conocimiento no encontrado');
    }

    if (!document.extractedText?.trim()) {
      throw new BadRequestException(
        'El documento no tiene texto extraído para reprocesar',
      );
    }

    const job = await this.createJob('REPROCESS', actor, correlationId, {
      documentId,
    });
    const startedAt = Date.now();

    try {
      await this.rebuildDocumentVersion(document, document.extractedText);
      document.status = 'READY_FOR_REVIEW';
      document.ingestionError = undefined;
      await document.save();
      await this.completeJob(job._id, 'COMPLETED', startedAt);
      await this.invalidateKnowledgeCache(document._id.toString());
      return this.getDocument(documentId);
    } catch (error: unknown) {
      await this.completeJob(
        job._id,
        'FAILED',
        startedAt,
        this.toErrorMessage(error),
      );
      throw error;
    }
  }

  async reviewDocument(
    documentId: string,
    dto: ReviewKnowledgeDocumentDto,
    actor: RequestUser,
  ) {
    const document = await this.documentModel.findById(documentId).exec();
    if (!document) {
      throw new NotFoundException('Documento de conocimiento no encontrado');
    }

    if (dto.status === 'APPROVED' && actor.role !== UserRole.DOCTOR) {
      throw new ForbiddenException(
        'Solo un DOCTOR puede aprobar contenido clínico',
      );
    }

    if (dto.status === 'APPROVED') {
      const doctor = await this.doctorModel
        .findById(actor.userId)
        .select('doctorStatus')
        .lean<{ doctorStatus?: DoctorStatus }>()
        .exec();

      if (!doctor || doctor.doctorStatus !== DoctorStatus.VERIFIED) {
        throw new ForbiddenException(
          'Solo un DOCTOR VERIFIED puede aprobar contenido clínico',
        );
      }
    }

    document.status = dto.status;
    document.reviewedAt = new Date();
    document.approvedBy = actor.userId;
    await document.save();

    await this.reviewModel.create({
      documentId: document._id,
      reviewerId: actor.userId,
      reviewerRole: actor.role,
      status: dto.status,
      notes: dto.notes,
    });

    await this.chunkModel.updateMany(
      document.currentVersionId
        ? { documentVersionId: document.currentVersionId }
        : { documentId: document._id },
      { $set: { reviewStatus: dto.status } },
    );
    await this.invalidateKnowledgeCache(document._id.toString());

    return this.getDocument(documentId);
  }

  async getApprovedCorpusVersion(): Promise<string> {
    const latest = await this.documentModel
      .find({ status: 'APPROVED' })
      .sort({ updatedAt: -1 })
      .select('updatedAt _id')
      .lean()
      .limit(1)
      .exec();

    const item = latest[0];
    if (!item) {
      return 'empty';
    }

    return `${item._id.toString()}:${item.updatedAt?.toISOString() ?? 'na'}`;
  }

  private async parseMetadata(dto: IngestDocumentDto): Promise<ParsedMetadata> {
    let sourceId: Types.ObjectId | undefined;
    if (dto.sourceId) {
      if (!Types.ObjectId.isValid(dto.sourceId)) {
        throw new BadRequestException('sourceId inválido');
      }

      const source = await this.sourceModel
        .findById(dto.sourceId)
        .lean()
        .exec();
      if (!source) {
        throw new NotFoundException('Fuente de conocimiento no encontrada');
      }
      sourceId = new Types.ObjectId(dto.sourceId);
    }

    return {
      sourceId,
      title: dto.title.trim(),
      authority: dto.authority.trim(),
      sourceType: dto.sourceType,
      specialty: dto.specialty,
      country: dto.country?.trim() || 'CO',
      clinicalTags: this.parseArray(dto.clinicalTags),
      symptoms: this.parseArray(dto.symptoms),
      redFlags: this.parseArray(dto.redFlags),
      drugNames: this.parseArray(dto.drugNames),
      audience: (dto.audience as KnowledgeAudience) ?? 'STAFF',
      useCases: this.parseUseCases(dto.useCases),
      language: dto.language?.trim() || 'es',
      validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
      validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
    };
  }

  private async extractUploadedContent(
    dto: IngestDocumentDto,
    file?: UploadedKnowledgeFile,
  ) {
    if (dto.contentText?.trim()) {
      return {
        text: dto.contentText.trim(),
        storageFileId: undefined,
        mimeType: 'text/plain',
        originalFileName: `${dto.title}.txt`,
        extractionMethod: 'inline_text',
      };
    }

    if (!file) {
      throw new BadRequestException('Archivo no encontrado');
    }

    this.assertUploadedFile(file);
    const storageFileId = await this.storageService.saveFile(
      file.originalname,
      file.mimetype,
      file.buffer,
    );
    const extracted = this.extractTextFromBuffer(file.buffer, file.mimetype);

    return {
      text: extracted.text,
      storageFileId,
      mimeType: file.mimetype,
      originalFileName: file.originalname,
      extractionMethod: extracted.extractionMethod,
    };
  }

  private extractTextFromBuffer(buffer: Buffer, mimeType: string) {
    if (mimeType.includes('html')) {
      const html = buffer.toString('utf8');
      return {
        text: this.stripHtml(html),
        extractionMethod: 'html_strip',
      };
    }

    if (
      mimeType.includes('markdown') ||
      mimeType.includes('text/plain') ||
      mimeType.includes('json') ||
      mimeType.includes('csv')
    ) {
      return {
        text: buffer.toString('utf8'),
        extractionMethod: 'plain_text',
      };
    }

    if (mimeType.includes('pdf')) {
      const text = this.extractPdfText(buffer);
      if (!text.trim()) {
        throw new BadRequestException(
          'No fue posible extraer texto utilizable del PDF. En Sprint 5 solo se admiten PDFs digitales con texto accesible.',
        );
      }
      return {
        text,
        extractionMethod: 'pdf_text_stream',
      };
    }

    return {
      text: buffer.toString('utf8'),
      extractionMethod: 'binary_utf8_fallback',
    };
  }

  private async createOrReplaceDocument(input: {
    metadata: ParsedMetadata;
    actor: RequestUser;
    correlationId?: string;
    text: string;
    storageFileId?: Types.ObjectId;
    mimeType?: string;
    originalFileName?: string;
    sourceUrl?: string;
    extractionMethod?: string;
  }) {
    const normalizedText = this.normalizeText(input.text);
    if (!normalizedText.trim()) {
      throw new BadRequestException(
        'El documento no contiene texto útil para indexación',
      );
    }

    const contentHash = this.hashContent(
      `${input.metadata.title}|${input.metadata.authority}|${normalizedText}`,
    );

    const document = await this.documentModel.create({
      sourceId: input.metadata.sourceId,
      title: input.metadata.title,
      authority: input.metadata.authority,
      sourceType: input.metadata.sourceType,
      status: 'PROCESSING',
      country: input.metadata.country,
      specialty: input.metadata.specialty,
      clinicalTags: input.metadata.clinicalTags,
      symptoms: input.metadata.symptoms,
      redFlags: input.metadata.redFlags,
      drugNames: input.metadata.drugNames,
      audience: input.metadata.audience,
      useCases: input.metadata.useCases,
      language: input.metadata.language,
      originalFileName: input.originalFileName,
      mimeType: input.mimeType,
      sourceUrl: input.sourceUrl,
      extractedText: input.text,
      extractionMethod: input.extractionMethod,
      storageFileId: input.storageFileId,
      contentHash,
      validFrom: input.metadata.validFrom,
      validUntil: input.metadata.validUntil,
      currentVersion: 0,
      sourceQualityTier: 100,
      tenantId: null,
    });

    try {
      await this.rebuildDocumentVersion(document, input.text);
      document.status = 'READY_FOR_REVIEW';
      await document.save();
      await this.invalidateKnowledgeCache(document._id.toString());
      return document;
    } catch (error: unknown) {
      document.status = 'FAILED';
      document.ingestionError = this.toErrorMessage(error);
      await document.save();
      throw error;
    }
  }

  private async rebuildDocumentVersion(
    document: KnowledgeDocumentDocument,
    rawText: string,
  ) {
    const normalizedText = this.normalizeText(rawText);
    const contentHash = this.hashContent(
      `${document.title}|${document.authority}|${normalizedText}`,
    );
    const chunks = this.chunkDocument(rawText, document.sourceType);
    const nextVersion = Math.max(document.currentVersion ?? 0, 0) + 1;
    const embeddings = await this.aiService.embedTexts({
      model:
        this.configService.get<string>('rag.embeddingModel') ??
        'gemini-embedding-001',
      contents: chunks.map((chunk) => chunk.text),
      taskType: 'RETRIEVAL_DOCUMENT',
      outputDimensionality:
        this.configService.get<number>('rag.embeddingDimensions') ?? 768,
    });

    const version = await this.documentVersionModel.create({
      documentId: document._id,
      version: nextVersion,
      extractedText: rawText,
      normalizedText,
      extractionMethod: document.extractionMethod,
      contentHash,
      storageFileId: document.storageFileId,
      chunkCount: chunks.length,
    });

    const chunkDocs = chunks.map((chunk, index) => ({
      documentId: document._id,
      documentVersionId: version._id,
      documentVersion: version.version,
      chunkIndex: index,
      title: document.title,
      sectionPath: chunk.sectionPath,
      text: chunk.text,
      normalizedText: this.normalizeText(chunk.text),
      contentHash: this.hashContent(
        `${document._id.toString()}|${index}|${this.normalizeText(chunk.text)}`,
      ),
      authority: document.authority,
      country: document.country,
      specialty: document.specialty,
      clinicalTags: document.clinicalTags,
      symptoms: document.symptoms,
      redFlags: document.redFlags,
      drugNames: document.drugNames,
      audience: document.audience,
      useCases: document.useCases,
      reviewStatus: 'REJECTED',
      embedding: embeddings.embeddings[index] ?? [],
      embeddingDimensions: embeddings.embeddings[index]?.length ?? 0,
      embeddingModel: embeddings.model,
      validFrom: document.validFrom,
      validUntil: document.validUntil,
      extraMetadata: {
        sourceUrl: document.sourceUrl,
        originalFileName: document.originalFileName,
      },
      isCurrentVersion: true,
      tenantId: null,
    }));

    if (chunkDocs.length > 0) {
      await this.chunkModel.insertMany(chunkDocs);
    }

    if (document.currentVersionId) {
      await this.chunkModel.updateMany(
        {
          documentId: document._id,
          documentVersionId: document.currentVersionId,
        },
        {
          $set: {
            isCurrentVersion: false,
            reviewStatus: 'REJECTED',
          },
        },
      );
    }

    document.currentVersion = version.version;
    document.currentVersionId = version._id;
    document.contentHash = contentHash;
  }

  private chunkDocument(
    rawText: string,
    sourceType: KnowledgeDocument['sourceType'],
  ): ChunkPayload[] {
    const sanitized = rawText.replace(/\r/g, '').trim();
    if (!sanitized) {
      return [];
    }

    const size =
      sourceType === 'FAQ' || sourceType === 'ROUTE'
        ? 1_800
        : sourceType === 'MEDICATION'
          ? 1_200
          : 3_600;
    const overlap =
      sourceType === 'FAQ' || sourceType === 'ROUTE'
        ? 250
        : sourceType === 'MEDICATION'
          ? 150
          : 700;

    const sections = sanitized
      .split(/\n\s*\n+/)
      .map((section) => section.trim())
      .filter(Boolean);
    const chunks: ChunkPayload[] = [];
    let current = '';
    let currentHeading = 'General';

    for (const section of sections) {
      const heading = section.split('\n')[0]?.slice(0, 120) || currentHeading;
      if (current.length > 0 && current.length + section.length > size) {
        chunks.push({
          sectionPath: currentHeading,
          text: current.trim(),
        });
        const tail = current.slice(Math.max(current.length - overlap, 0));
        current = `${tail}\n${section}`.trim();
        currentHeading = heading;
      } else {
        current = `${current}\n\n${section}`.trim();
        currentHeading = heading;
      }
    }

    if (current.trim()) {
      chunks.push({
        sectionPath: currentHeading,
        text: current.trim(),
      });
    }

    return chunks.length > 0
      ? chunks
      : [{ sectionPath: 'General', text: sanitized }];
  }

  private stripHtml(html: string): string {
    const lowerHtml = html.toLowerCase();
    let text = '';
    let index = 0;

    while (index < html.length) {
      if (html[index] !== '<') {
        text += html[index];
        index += 1;
        continue;
      }

      const tag = this.readHtmlTag(html, index);
      if (!tag) {
        text += html[index];
        index += 1;
        continue;
      }

      if (!tag.isClosing && (tag.name === 'script' || tag.name === 'style')) {
        index = this.skipHtmlElementContent(lowerHtml, tag.name, tag.end + 1);
      } else {
        index = tag.end + 1;
      }

      text += ' ';
    }

    return text
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractPdfText(buffer: Buffer): string {
    const raw = buffer.toString('latin1');
    const text = this.extractPdfLiteralStrings(raw)
      .map((match) => this.decodePdfLiteralString(match))
      .join(' ')
      .replace(/[^\S\r\n]+/g, ' ')
      .trim();

    return text;
  }

  private readHtmlTag(
    html: string,
    startIndex: number,
  ): { name: string; isClosing: boolean; end: number } | null {
    let index = startIndex + 1;
    let quote: '"' | "'" | null = null;

    while (index < html.length) {
      const char = html[index];
      if (quote) {
        if (char === quote) {
          quote = null;
        }
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === '>') {
        break;
      }
      index += 1;
    }

    if (index >= html.length || html[index] !== '>') {
      return null;
    }

    const content = html.slice(startIndex + 1, index).trim();
    const isClosing = content.startsWith('/');
    const normalized = isClosing ? content.slice(1).trimStart() : content;
    const name = normalized
      .slice(
        0,
        normalized.search(/[\s/>]/) === -1
          ? normalized.length
          : normalized.search(/[\s/>]/),
      )
      .toLowerCase();

    return {
      name,
      isClosing,
      end: index,
    };
  }

  private skipHtmlElementContent(
    lowerHtml: string,
    tagName: 'script' | 'style',
    startIndex: number,
  ): number {
    const openTag = `</${tagName}`;
    const closingStart = lowerHtml.indexOf(openTag, startIndex);
    if (closingStart === -1) {
      return lowerHtml.length;
    }

    const closingTag = this.readHtmlTag(lowerHtml, closingStart);
    return closingTag ? closingTag.end + 1 : lowerHtml.length;
  }

  private extractPdfLiteralStrings(raw: string): string[] {
    const matches: string[] = [];
    let current = '';
    let depth = 0;
    let escaping = false;

    for (const char of raw) {
      if (depth === 0) {
        if (char === '(') {
          current = '';
          depth = 1;
          escaping = false;
        }
        continue;
      }

      if (escaping) {
        current += char;
        escaping = false;
        continue;
      }

      if (char === '\\') {
        current += char;
        escaping = true;
        continue;
      }

      if (char === '(') {
        depth += 1;
        current += char;
        continue;
      }

      if (char === ')') {
        depth -= 1;
        if (depth === 0) {
          matches.push(current);
          current = '';
          continue;
        }

        current += char;
        continue;
      }

      current += char;
    }

    return matches;
  }

  private decodePdfLiteralString(value: string): string {
    return value
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\')
      .replace(/\\n/g, '\n');
  }

  private normalizeText(text: string): string {
    return text
      .normalize('NFKC')
      .replace(/\r/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .toLowerCase();
  }

  private parseArray(value?: string): string[] {
    if (!value?.trim()) {
      return [];
    }

    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private parseUseCases(value?: string): KnowledgeUseCase[] {
    const requested = this.parseArray(value);
    return requested.filter((item): item is KnowledgeUseCase =>
      (KNOWLEDGE_USE_CASES as readonly string[]).includes(item),
    );
  }

  private hashContent(content: string) {
    return createHash('sha256').update(content).digest('hex');
  }

  private async createJob(
    type: (typeof KNOWLEDGE_JOB_TYPES)[number],
    actor: RequestUser,
    correlationId?: string,
    payload: Record<string, unknown> = {},
  ) {
    return this.jobModel.create({
      type,
      status: 'RUNNING',
      triggeredBy: actor.userId,
      correlationId,
      payload,
      durationMs: 0,
    });
  }

  private async completeJob(
    jobId: Types.ObjectId,
    status: 'COMPLETED' | 'FAILED',
    startedAt: number,
    errorMessage?: string,
  ) {
    await this.jobModel.updateOne(
      { _id: jobId },
      {
        $set: {
          status,
          durationMs: Date.now() - startedAt,
          errorMessage,
        },
      },
    );
  }

  private async invalidateKnowledgeCache(documentId: string) {
    if (!this.redisClient) {
      return;
    }

    const redisKeyPrefix =
      this.configService.get<string>('redis.keyPrefix') ?? 'salud-de-una';
    const cachePattern = `${redisKeyPrefix}:rag:*`;

    try {
      const cacheKeys = await this.redisClient.keys(cachePattern);
      if (cacheKeys.length === 0) {
        return;
      }

      await this.redisClient.del(...cacheKeys);
      this.logger.debug(
        `Invalidated ${cacheKeys.length} RAG cache entries after document change ${documentId}`,
      );
    } catch (error: unknown) {
      this.logger.warn(
        `No fue posible invalidar la cache RAG tras el cambio del documento ${documentId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private assertUploadedFile(file: UploadedKnowledgeFile) {
    const maxBytes =
      this.configService.get<number>('knowledge.uploadMaxBytes') ??
      5 * 1024 * 1024;
    if (file.buffer.length > maxBytes) {
      throw new BadRequestException(
        `El archivo excede el tamaño máximo permitido (${maxBytes} bytes)`,
      );
    }

    this.assertAllowedMimeType(file.mimetype, file.originalname, {
      allowBinaryFallback: true,
    });
  }

  private assertAllowedMimeType(
    mimeType: string,
    fileName: string,
    options?: { allowBinaryFallback?: boolean },
  ) {
    const normalizedMime = this.normalizeMimeType(mimeType);
    if (
      options?.allowBinaryFallback &&
      normalizedMime === 'application/octet-stream'
    ) {
      return;
    }

    const allowedMimeTypes = this.configService.get<string[]>(
      'knowledge.allowedMimeTypes',
    ) ?? [
      'text/plain',
      'text/html',
      'text/markdown',
      'application/json',
      'text/csv',
      'application/pdf',
    ];
    if (!allowedMimeTypes.includes(normalizedMime)) {
      throw new BadRequestException(
        `Tipo de archivo no permitido para knowledge ingest: ${normalizedMime}`,
      );
    }

    if (fileName.startsWith('http://') || fileName.startsWith('https://')) {
      return;
    }

    const extension = extname(fileName).toLowerCase();
    const compatibleExtensionsByMime: Record<string, string[]> = {
      'text/plain': ['.txt'],
      'text/html': ['.html', '.htm'],
      'text/markdown': ['.md', '.markdown'],
      'application/json': ['.json'],
      'text/csv': ['.csv'],
      'application/pdf': ['.pdf'],
    };

    const compatibleExtensions =
      compatibleExtensionsByMime[normalizedMime] ?? [];
    if (
      compatibleExtensions.length > 0 &&
      !compatibleExtensions.includes(extension)
    ) {
      throw new BadRequestException(
        `La extensión ${extension || '(sin extensión)'} no coincide con el tipo ${normalizedMime}`,
      );
    }
  }

  private normalizeMimeType(mimeType: string): string {
    return (
      mimeType.split(';')[0]?.trim().toLowerCase() ?? 'application/octet-stream'
    );
  }

  private async downloadUrlDocument(sourceUrl: string): Promise<{
    mimeType: string;
    buffer: Buffer;
  }> {
    const parsedUrl = new URL(sourceUrl);
    if (parsedUrl.protocol !== 'https:') {
      throw new BadRequestException(
        'Solo se permite ingesta remota mediante HTTPS',
      );
    }

    const maxRedirects =
      this.configService.get<number>('knowledge.urlMaxRedirects') ?? 3;
    const timeoutMs =
      this.configService.get<number>('knowledge.urlFetchTimeoutMs') ?? 10_000;
    const maxBytes =
      this.configService.get<number>('knowledge.urlMaxBytes') ??
      5 * 1024 * 1024;

    let currentUrl = sourceUrl;
    for (
      let redirectCount = 0;
      redirectCount <= maxRedirects;
      redirectCount += 1
    ) {
      const headResponse = await fetchWithTimeout(currentUrl, {
        method: 'HEAD',
        redirect: 'manual',
        timeoutMs,
      }).catch(() => null);

      if (headResponse && this.isRedirectResponse(headResponse.status)) {
        const location = headResponse.headers.get('location');
        if (!location) {
          throw new BadRequestException(
            'La URL remota respondió con redirect inválido',
          );
        }
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      if (headResponse) {
        this.assertResponseSize(headResponse, maxBytes);
        const headMimeType = headResponse.headers?.get?.('content-type');
        if (headMimeType) {
          this.assertAllowedMimeType(headMimeType, currentUrl);
        }
      }

      const response = await fetchWithTimeout(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        timeoutMs,
      });

      if (this.isRedirectResponse(response.status)) {
        const location = response.headers.get('location');
        if (!location) {
          throw new BadRequestException(
            'La URL remota respondió con redirect inválido',
          );
        }
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      if (!response.ok) {
        throw new BadRequestException(
          `No fue posible descargar la URL (${response.status})`,
        );
      }

      this.assertResponseSize(response, maxBytes);
      const mimeType = this.normalizeMimeType(
        response.headers.get('content-type') ?? 'text/plain',
      );
      this.assertAllowedMimeType(mimeType, currentUrl);
      const buffer = await this.readResponseBuffer(response, maxBytes);

      return { mimeType, buffer };
    }

    throw new BadRequestException(
      'La URL excedió el máximo de redirecciones permitido',
    );
  }

  private isRedirectResponse(status: number): boolean {
    return status >= 300 && status < 400;
  }

  private assertResponseSize(response: Response, maxBytes: number) {
    const contentLengthHeader = response.headers?.get?.('content-length');
    if (!contentLengthHeader) {
      return;
    }

    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new BadRequestException(
        `El recurso remoto excede el tamaño máximo permitido (${maxBytes} bytes)`,
      );
    }
  }

  private async readResponseBuffer(
    response: Response,
    maxBytes: number,
  ): Promise<Buffer> {
    if (typeof response.arrayBuffer === 'function') {
      const rawBuffer = Buffer.from(await response.arrayBuffer());
      if (rawBuffer.length > maxBytes) {
        throw new BadRequestException(
          `El recurso remoto excede el tamaño máximo permitido (${maxBytes} bytes)`,
        );
      }

      return rawBuffer;
    }

    if (!response.body) {
      return Buffer.alloc(0);
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      totalLength += value.length;
      if (totalLength > maxBytes) {
        throw new BadRequestException(
          `El recurso remoto excede el tamaño máximo permitido (${maxBytes} bytes)`,
        );
      }

      chunks.push(value);
    }

    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  }

  private toDocumentResponse(document: DocumentResponseSource) {
    return {
      id: document._id.toString(),
      sourceId: document.sourceId?.toString() ?? null,
      title: document.title,
      authority: document.authority,
      sourceType: document.sourceType,
      status: document.status,
      country: document.country,
      specialty: document.specialty,
      audience: document.audience,
      useCases: document.useCases,
      language: document.language,
      originalFileName: document.originalFileName ?? null,
      mimeType: document.mimeType ?? null,
      sourceUrl: document.sourceUrl ?? null,
      currentVersion: document.currentVersion,
      reviewedAt: document.reviewedAt?.toISOString() ?? null,
      approvedBy: document.approvedBy ?? null,
      ingestionError: document.ingestionError ?? null,
      createdAt: document.createdAt?.toISOString() ?? null,
      updatedAt: document.updatedAt?.toISOString() ?? null,
    };
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
