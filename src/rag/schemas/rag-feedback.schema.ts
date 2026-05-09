import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RagFeedbackDocument = HydratedDocument<RagFeedback>;

@Schema({ timestamps: true })
export class RagFeedback {
  @Prop({ required: true, trim: true, index: true })
  traceId!: string;

  @Prop({ trim: true })
  consultationId?: string;

  @Prop({ trim: true })
  actorId?: string;

  @Prop({ trim: true })
  actorRole?: string;

  @Prop({ required: true })
  useful!: boolean;

  @Prop({ required: true })
  grounded!: boolean;

  @Prop({ trim: true })
  comment?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const RagFeedbackSchema = SchemaFactory.createForClass(RagFeedback);

RagFeedbackSchema.index({ traceId: 1, createdAt: -1 });
