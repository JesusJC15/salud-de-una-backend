import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Specialty } from '../../common/enums/specialty.enum';
import type { TriagePriority } from '../../triage/schemas/triage-session.schema';

export const CONSULTATION_STATUSES = [
  'PENDING',
  'IN_ATTENTION',
  'CLOSED',
] as const;
export type ConsultationStatus = (typeof CONSULTATION_STATUSES)[number];
export const ConsultationStatusValue = {
  PENDING: 'PENDING',
  IN_ATTENTION: 'IN_ATTENTION',
  CLOSED: 'CLOSED',
} as const;

export type ConsultationDocument = HydratedDocument<Consultation>;

export const SUMMARY_FEEDBACK_VALUES = [
  'USEFUL',
  'PARTIALLY_USEFUL',
  'NOT_USEFUL',
] as const;
export type SummaryFeedbackValue = (typeof SUMMARY_FEEDBACK_VALUES)[number];

@Schema({ _id: false })
export class ConsultationSummaryFeedback {
  @Prop({ required: true, type: String, enum: SUMMARY_FEEDBACK_VALUES })
  value!: SummaryFeedbackValue;

  @Prop()
  comment?: string;

  @Prop({ required: true })
  createdBy!: string;

  @Prop({ required: true, type: Date })
  createdAt!: Date;
}

export const ConsultationSummaryFeedbackSchema = SchemaFactory.createForClass(
  ConsultationSummaryFeedback,
);

@Schema({ timestamps: true })
export class Consultation {
  @Prop({ type: Types.ObjectId, ref: 'Patient', required: true, index: true })
  patientId!: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'TriageSession',
    required: true,
    index: true,
  })
  triageSessionId!: Types.ObjectId;

  @Prop({ required: true, type: String, enum: Specialty })
  specialty!: Specialty;

  @Prop({ required: true, type: String, enum: ['LOW', 'MODERATE', 'HIGH'] })
  priority!: TriagePriority;

  @Prop({
    required: true,
    type: String,
    enum: CONSULTATION_STATUSES,
    default: 'PENDING',
  })
  status!: ConsultationStatus;

  @Prop({ type: Types.ObjectId, ref: 'Doctor' })
  assignedDoctorId?: Types.ObjectId;

  @Prop({ type: Date })
  assignedAt?: Date;

  @Prop({ type: Date })
  closedAt?: Date;

  @Prop()
  clinicalSummary?: string;

  @Prop({ min: 1, max: 10 })
  baselineSymptomSeverity?: number;

  @Prop()
  redFlagsConfirmed?: boolean;

  @Prop({ min: 1, max: 5 })
  rating?: number;

  @Prop()
  ratingComment?: string;

  @Prop({ type: ConsultationSummaryFeedbackSchema })
  summaryFeedback?: ConsultationSummaryFeedback;

  @Prop({ type: Types.ObjectId, ref: 'Followup' })
  sourceFollowupId?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ConsultationSchema = SchemaFactory.createForClass(Consultation);

ConsultationSchema.index({ status: 1, priority: 1, createdAt: 1 });
