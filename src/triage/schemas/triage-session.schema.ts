import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { Specialty } from '../../common/enums/specialty.enum';

export const TRIAGE_SESSION_STATUSES = [
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED',
] as const;

export type TriageSessionStatus = (typeof TRIAGE_SESSION_STATUSES)[number];

export const TRIAGE_PRIORITIES = ['LOW', 'MODERATE', 'HIGH'] as const;
export type TriagePriority = (typeof TRIAGE_PRIORITIES)[number];

export const TRIAGE_RED_FLAG_SEVERITIES = [
  'CRITICAL',
  'WARNING',
  'INFO',
] as const;
export type TriageRedFlagSeverity = (typeof TRIAGE_RED_FLAG_SEVERITIES)[number];

@Schema({ _id: false })
export class TriageAnswer {
  @Prop({ required: true, trim: true })
  questionId!: string;

  @Prop({ required: true, trim: true })
  questionText!: string;

  @Prop({ required: true, type: SchemaTypes.Mixed })
  answerValue!: unknown;

  @Prop({ required: true, type: Date })
  answeredAt!: Date;
}

export const TriageAnswerSchema = SchemaFactory.createForClass(TriageAnswer);

@Schema({ _id: false })
export class RedFlag {
  @Prop({ required: true, trim: true })
  code!: string;

  @Prop({ required: true, type: String, enum: Specialty })
  specialty!: Specialty;

  @Prop({ required: true, type: String, enum: TRIAGE_RED_FLAG_SEVERITIES })
  severity!: TriageRedFlagSeverity;

  @Prop({ required: true, trim: true })
  evidence!: string;
}

export const RedFlagSchema = SchemaFactory.createForClass(RedFlag);

@Schema({ _id: false })
export class TriageAnalysis {
  @Prop({ required: true, type: String, enum: TRIAGE_PRIORITIES })
  priority!: TriagePriority;

  @Prop({ type: [RedFlagSchema], default: [] })
  redFlags!: RedFlag[];

  @Prop({ trim: true })
  aiSummary?: string;

  @Prop({ required: true, min: 0 })
  analysisDurationMs!: number;

  @Prop({ required: true, default: false })
  guardrailApplied!: boolean;
}

export const TriageAnalysisSchema =
  SchemaFactory.createForClass(TriageAnalysis);

export type TriageSessionDocument = HydratedDocument<TriageSession>;

@Schema({ timestamps: true })
export class TriageSession {
  @Prop({ type: Types.ObjectId, ref: 'Patient', required: true, index: true })
  patientId!: Types.ObjectId;

  @Prop({ required: true, type: String, enum: Specialty })
  specialty!: Specialty;

  @Prop({
    required: true,
    type: String,
    enum: TRIAGE_SESSION_STATUSES,
    default: 'IN_PROGRESS',
  })
  status!: TriageSessionStatus;

  @Prop({ type: [TriageAnswerSchema], default: [] })
  answers!: TriageAnswer[];

  @Prop({ type: TriageAnalysisSchema })
  analysis?: TriageAnalysis;

  @Prop({ type: Date })
  completedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const TriageSessionSchema = SchemaFactory.createForClass(TriageSession);

TriageSessionSchema.index({ patientId: 1, status: 1 });
