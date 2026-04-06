import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';

export type OutboxEventDocument = HydratedDocument<OutboxEvent>;

@Schema({ timestamps: true })
export class OutboxEvent {
  @Prop({ required: true, index: true })
  eventType!: string;

  @Prop({ required: true, index: true })
  aggregateType!: string;

  @Prop({ required: true, index: true })
  aggregateId!: string;

  @Prop({ type: SchemaTypes.Mixed, required: true })
  payload!: Record<string, unknown>;

  @Prop({
    required: true,
    index: true,
    enum: ['pending', 'dispatched', 'processed', 'failed'],
    default: 'pending',
  })
  status!: 'pending' | 'dispatched' | 'processed' | 'failed';

  @Prop({ required: true, min: 0, default: 0 })
  attempts!: number;

  @Prop({ required: true, index: true, default: () => new Date() })
  availableAt!: Date;

  @Prop()
  processedAt?: Date;

  @Prop()
  lastError?: string;

  @Prop()
  correlationId?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const OutboxEventSchema = SchemaFactory.createForClass(OutboxEvent);

OutboxEventSchema.index({ status: 1, availableAt: 1, createdAt: 1 });
