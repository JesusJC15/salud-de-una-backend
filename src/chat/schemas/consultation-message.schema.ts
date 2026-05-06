import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { UserRole } from '../../common/enums/user-role.enum';

export const CHAT_MESSAGE_TYPES = ['TEXT'] as const;
export type ChatMessageType = (typeof CHAT_MESSAGE_TYPES)[number];

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

  @Prop({
    required: true,
    type: String,
    enum: [UserRole.PATIENT, UserRole.DOCTOR],
  })
  senderRole!: UserRole.PATIENT | UserRole.DOCTOR;

  @Prop({ required: true, trim: true, maxlength: 4000 })
  content!: string;

  @Prop({
    required: true,
    type: String,
    enum: CHAT_MESSAGE_TYPES,
    default: 'TEXT',
  })
  type!: ChatMessageType;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ConsultationMessageSchema =
  SchemaFactory.createForClass(ConsultationMessage);

ConsultationMessageSchema.index({ consultationId: 1, createdAt: 1 });
