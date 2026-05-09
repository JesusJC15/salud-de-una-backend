import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';

export type RagTraceDocument = HydratedDocument<RagTrace>;

@Schema({ _id: false })
export class RagTraceHit {
  @Prop({ required: true })
  chunkId!: string;

  @Prop({ required: true })
  documentId!: string;

  @Prop({ required: true })
  title!: string;

  @Prop()
  sectionPath?: string;

  @Prop({ required: true })
  score!: number;

  @Prop({ required: true })
  authority!: string;

  @Prop({ required: true })
  snippet!: string;
}

export const RagTraceHitSchema = SchemaFactory.createForClass(RagTraceHit);

@Schema({ timestamps: true })
export class RagTrace {
  @Prop({ trim: true, index: true })
  correlationId?: string;

  @Prop({ required: true, trim: true })
  useCase!: string;

  @Prop({ required: true, trim: true })
  normalizedQuery!: string;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  filters!: Record<string, unknown>;

  @Prop({ type: [RagTraceHitSchema], default: [] })
  selectedChunks!: RagTraceHit[];

  @Prop({ required: true, default: false })
  cacheHit!: boolean;

  @Prop({ required: true, default: false })
  grounded!: boolean;

  @Prop({ required: true, default: false })
  fallback!: boolean;

  @Prop({ required: true, default: 0 })
  retrievalLatencyMs!: number;

  @Prop({ required: true, default: 0 })
  generationLatencyMs!: number;

  @Prop({ required: true, default: 0 })
  totalLatencyMs!: number;

  @Prop({ trim: true })
  answer?: string;

  @Prop({ trim: true })
  actorId?: string;

  @Prop({ trim: true })
  actorRole?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const RagTraceSchema = SchemaFactory.createForClass(RagTrace);

RagTraceSchema.index({ createdAt: -1, useCase: 1, grounded: 1 });
