import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ConsultationMessageDocument = HydratedDocument<ConsultationMessage>;

@Schema({ timestamps: true })
export class ConsultationMessage {
  @Prop({
    type: Types.ObjectId,
    ref: 'Consultation',
    required: true,
    index: true,
  })
  consultationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  senderId!: Types.ObjectId;

  @Prop({ required: true, type: String, enum: ['PATIENT', 'DOCTOR'] })
  senderRole!: 'PATIENT' | 'DOCTOR';

  @Prop({ required: true, trim: true, maxlength: 2000 })
  content!: string;

  @Prop({ required: true, type: String, enum: ['TEXT'], default: 'TEXT' })
  type!: 'TEXT';

  createdAt?: Date;
  updatedAt?: Date;
}

export const ConsultationMessageSchema =
  SchemaFactory.createForClass(ConsultationMessage);

ConsultationMessageSchema.index({ consultationId: 1, createdAt: 1 });
