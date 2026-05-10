import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type KnowledgeDocumentVersionDocument =
  HydratedDocument<KnowledgeDocumentVersion>;

@Schema({ timestamps: true })
export class KnowledgeDocumentVersion {
  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: 'KnowledgeDocument',
    index: true,
  })
  documentId!: Types.ObjectId;

  @Prop({ required: true, min: 1 })
  version!: number;

  @Prop({ trim: true })
  extractedText?: string;

  @Prop({ trim: true })
  normalizedText?: string;

  @Prop({ trim: true })
  extractionMethod?: string;

  @Prop({ required: true, trim: true })
  contentHash!: string;

  @Prop({ type: Types.ObjectId })
  storageFileId?: Types.ObjectId;

  @Prop({ type: Number, default: 0 })
  chunkCount!: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const KnowledgeDocumentVersionSchema = SchemaFactory.createForClass(
  KnowledgeDocumentVersion,
);

KnowledgeDocumentVersionSchema.index({ documentId: 1, version: -1 });
KnowledgeDocumentVersionSchema.index({ documentId: 1, version: 1 }, { unique: true });
