import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { Specialty } from '../../common/enums/specialty.enum';
import {
  KNOWLEDGE_AUDIENCES,
  KNOWLEDGE_REVIEW_STATUSES,
  KNOWLEDGE_USE_CASES,
  type KnowledgeAudience,
  type KnowledgeReviewStatus,
  type KnowledgeUseCase,
} from '../knowledge.constants';

export type KnowledgeChunkDocument = HydratedDocument<KnowledgeChunk>;

@Schema({ timestamps: true })
export class KnowledgeChunk {
  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'KnowledgeDocument',
    index: true,
  })
  documentId!: Types.ObjectId;

  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'KnowledgeDocumentVersion',
    index: true,
  })
  documentVersionId!: Types.ObjectId;

  @Prop({ required: true, min: 1 })
  documentVersion!: number;

  @Prop({ required: true, min: 0 })
  chunkIndex!: number;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ trim: true, default: '' })
  sectionPath!: string;

  @Prop({ required: true, trim: true })
  text!: string;

  @Prop({ required: true, trim: true, index: true })
  normalizedText!: string;

  @Prop({ required: true, trim: true })
  contentHash!: string;

  @Prop({ required: true, trim: true })
  authority!: string;

  @Prop({ required: true, trim: true, default: 'CO' })
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

  @Prop({
    required: true,
    type: String,
    enum: KNOWLEDGE_REVIEW_STATUSES,
    default: 'REJECTED',
    index: true,
  })
  reviewStatus!: KnowledgeReviewStatus;

  @Prop({ type: [Number], default: [] })
  embedding!: number[];

  @Prop({ type: Number, default: 0 })
  embeddingDimensions!: number;

  @Prop({ trim: true })
  embeddingModel?: string;

  @Prop({ type: Date })
  validFrom?: Date;

  @Prop({ type: Date })
  validUntil?: Date;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  extraMetadata!: Record<string, unknown>;

  @Prop({ type: Types.ObjectId, default: null, index: true })
  tenantId?: Types.ObjectId | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const KnowledgeChunkSchema =
  SchemaFactory.createForClass(KnowledgeChunk);

KnowledgeChunkSchema.index({ documentId: 1, chunkIndex: 1 }, { unique: true });
KnowledgeChunkSchema.index({
  status: 1,
  reviewStatus: 1,
  specialty: 1,
  audience: 1,
});
KnowledgeChunkSchema.index({
  normalizedText: 'text',
  title: 'text',
  sectionPath: 'text',
  clinicalTags: 'text',
  symptoms: 'text',
  redFlags: 'text',
  drugNames: 'text',
});
