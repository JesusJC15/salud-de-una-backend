import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  KNOWLEDGE_REVIEW_STATUSES,
  type KnowledgeReviewStatus,
} from '../knowledge.constants';

export type KnowledgeReviewDocument = HydratedDocument<KnowledgeReview>;

@Schema({ timestamps: true })
export class KnowledgeReview {
  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'KnowledgeDocument',
    index: true,
  })
  documentId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  reviewerId!: string;

  @Prop({ required: true, trim: true })
  reviewerRole!: string;

  @Prop({ required: true, type: String, enum: KNOWLEDGE_REVIEW_STATUSES })
  status!: KnowledgeReviewStatus;

  @Prop({ trim: true })
  notes?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const KnowledgeReviewSchema =
  SchemaFactory.createForClass(KnowledgeReview);

KnowledgeReviewSchema.index({ documentId: 1, createdAt: -1 });
