import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  KNOWLEDGE_JOB_STATUSES,
  KNOWLEDGE_JOB_TYPES,
  type KnowledgeJobStatus,
  type KnowledgeJobType,
} from '../knowledge.constants';

export type KnowledgeJobDocument = HydratedDocument<KnowledgeJob>;

@Schema({ timestamps: true })
export class KnowledgeJob {
  @Prop({ required: true, type: String, enum: KNOWLEDGE_JOB_TYPES })
  type!: KnowledgeJobType;

  @Prop({ required: true, type: String, enum: KNOWLEDGE_JOB_STATUSES })
  status!: KnowledgeJobStatus;

  @Prop({ type: Types.ObjectId, ref: 'KnowledgeDocument', index: true })
  documentId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'KnowledgeSource', index: true })
  sourceId?: Types.ObjectId;

  @Prop({ trim: true })
  triggeredBy?: string;

  @Prop({ trim: true })
  correlationId?: string;

  @Prop({ type: Number, default: 0 })
  durationMs!: number;

  @Prop({ trim: true })
  errorMessage?: string;

  @Prop({ type: Object, default: {} })
  payload!: Record<string, unknown>;

  createdAt?: Date;
  updatedAt?: Date;
}

export const KnowledgeJobSchema = SchemaFactory.createForClass(KnowledgeJob);

KnowledgeJobSchema.index({ type: 1, status: 1, createdAt: -1 });
