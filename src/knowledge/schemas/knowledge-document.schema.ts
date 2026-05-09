import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Specialty } from '../../common/enums/specialty.enum';
import {
  KNOWLEDGE_AUDIENCES,
  KNOWLEDGE_DOCUMENT_STATUSES,
  KNOWLEDGE_SOURCE_TYPES,
  KNOWLEDGE_USE_CASES,
  type KnowledgeAudience,
  type KnowledgeDocumentStatus,
  type KnowledgeSourceType,
  type KnowledgeUseCase,
} from '../knowledge.constants';

export type KnowledgeDocumentDocument = HydratedDocument<KnowledgeDocument>;

@Schema({ timestamps: true })
export class KnowledgeDocument {
  @Prop({ type: Types.ObjectId, ref: 'KnowledgeSource', index: true })
  sourceId?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ required: true, trim: true })
  authority!: string;

  @Prop({ required: true, type: String, enum: KNOWLEDGE_SOURCE_TYPES })
  sourceType!: KnowledgeSourceType;

  @Prop({
    required: true,
    type: String,
    enum: KNOWLEDGE_DOCUMENT_STATUSES,
    default: 'DRAFT',
  })
  status!: KnowledgeDocumentStatus;

  @Prop({ trim: true, default: 'CO', index: true })
  country!: string;

  @Prop({ required: true, type: String, enum: Specialty, index: true })
  specialty!: Specialty;

  @Prop({ type: [String], default: [] })
  clinicalTags!: string[];

  @Prop({ type: [String], default: [] })
  symptoms!: string[];

  @Prop({ type: [String], default: [] })
  redFlags!: string[];

  @Prop({ type: [String], default: [] })
  drugNames!: string[];

  @Prop({ type: String, enum: KNOWLEDGE_AUDIENCES, default: 'STAFF' })
  audience!: KnowledgeAudience;

  @Prop({ type: [String], enum: KNOWLEDGE_USE_CASES, default: [] })
  useCases!: KnowledgeUseCase[];

  @Prop({ default: 'es' })
  language!: string;

  @Prop({ trim: true })
  originalFileName?: string;

  @Prop({ trim: true })
  mimeType?: string;

  @Prop({ trim: true })
  sourceUrl?: string;

  @Prop({ trim: true })
  extractedText?: string;

  @Prop({ trim: true })
  extractionMethod?: string;

  @Prop({ type: Types.ObjectId })
  storageFileId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  currentVersionId?: Types.ObjectId;

  @Prop({ default: 1 })
  currentVersion!: number;

  @Prop({ required: true, trim: true, index: true })
  contentHash!: string;

  @Prop({ type: Date })
  validFrom?: Date;

  @Prop({ type: Date })
  validUntil?: Date;

  @Prop({ trim: true })
  ingestionError?: string;

  @Prop({ trim: true })
  approvedBy?: string;

  @Prop({ type: Date })
  reviewedAt?: Date;

  @Prop({ type: Number, default: 100 })
  sourceQualityTier!: number;

  @Prop({ type: Types.ObjectId, default: null, index: true })
  tenantId?: Types.ObjectId | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const KnowledgeDocumentSchema =
  SchemaFactory.createForClass(KnowledgeDocument);

KnowledgeDocumentSchema.index({
  status: 1,
  specialty: 1,
  audience: 1,
  sourceType: 1,
  country: 1,
});
