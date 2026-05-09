import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  KNOWLEDGE_SOURCE_STATUSES,
  KNOWLEDGE_SOURCE_TYPES,
  type KnowledgeSourceStatus,
  type KnowledgeSourceType,
} from '../knowledge.constants';

export type KnowledgeSourceDocument = HydratedDocument<KnowledgeSource>;

@Schema({ timestamps: true })
export class KnowledgeSource {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, trim: true })
  authority!: string;

  @Prop({ required: true, type: String, enum: KNOWLEDGE_SOURCE_TYPES })
  sourceType!: KnowledgeSourceType;

  @Prop({ type: String, enum: KNOWLEDGE_SOURCE_STATUSES, default: 'ACTIVE' })
  status!: KnowledgeSourceStatus;

  @Prop({ trim: true })
  baseUrl?: string;

  @Prop({ trim: true, default: 'CO' })
  country!: string;

  @Prop({ default: true })
  allowUrlIngest!: boolean;

  @Prop({ default: 100 })
  authorityWeight!: number;

  @Prop({ default: false })
  isGlobalFallback!: boolean;

  @Prop({ trim: true })
  notes?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const KnowledgeSourceSchema =
  SchemaFactory.createForClass(KnowledgeSource);

KnowledgeSourceSchema.index({ name: 1 }, { unique: true });
KnowledgeSourceSchema.index({ status: 1, country: 1, sourceType: 1 });
