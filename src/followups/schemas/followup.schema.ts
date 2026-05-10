import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export const FOLLOWUP_STATUSES = [
  'PENDING',
  'REMINDED',
  'COMPLETED',
  'MISSED',
] as const;
export type FollowupStatus = (typeof FOLLOWUP_STATUSES)[number];

export const FOLLOWUP_CHANGES = ['BETTER', 'SAME', 'WORSE'] as const;
export type FollowupChange = (typeof FOLLOWUP_CHANGES)[number];

export type FollowupDocument = HydratedDocument<Followup>;

@Schema({ timestamps: true })
export class Followup {
  @Prop({
    type: Types.ObjectId,
    ref: 'Consultation',
    required: true,
    index: true,
  })
  consultationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Patient', required: true, index: true })
  patientId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Doctor', index: true })
  doctorId?: Types.ObjectId;

  @Prop({ required: true, type: Date, index: true })
  scheduledAt!: Date;

  @Prop({ required: true, type: Date })
  reminderAt!: Date;

  @Prop({
    required: true,
    type: String,
    enum: FOLLOWUP_STATUSES,
    default: 'PENDING',
  })
  status!: FollowupStatus;

  @Prop({ required: true, min: 1, max: 10 })
  baselineSymptomSeverity!: number;

  @Prop({ min: 1, max: 10 })
  currentSymptomSeverity?: number;

  @Prop({ type: String, enum: FOLLOWUP_CHANGES })
  change?: FollowupChange;

  @Prop()
  medicationTaken?: boolean;

  @Prop()
  medicationNotes?: string;

  @Prop()
  newSymptoms?: string;

  @Prop({ type: Date })
  submittedAt?: Date;

  @Prop({ default: false })
  priorityEscalated!: boolean;

  @Prop({ type: Types.ObjectId, ref: 'Consultation' })
  createdConsultationId?: Types.ObjectId;

  @Prop({ sparse: true, unique: true, index: true })
  sourceEventId?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const FollowupSchema = SchemaFactory.createForClass(Followup);

FollowupSchema.index({ patientId: 1, status: 1, scheduledAt: 1 });
FollowupSchema.index({ consultationId: 1, scheduledAt: 1 }, { unique: true });
