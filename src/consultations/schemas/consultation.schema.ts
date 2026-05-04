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

export type ConsultationDocument = HydratedDocument<Consultation>;

@Schema({ timestamps: true })
export class Consultation {
  @Prop({ type: Types.ObjectId, ref: 'Patient', required: true, index: true })
  patientId!: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'TriageSession',
    required: true,
    unique: true,
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

  @Prop({ type: String })
  clinicalSummary?: string;

  @Prop({ type: Date })
  closedAt?: Date;

  @Prop({ type: Number, min: 1, max: 5 })
  rating?: number;

  @Prop({ type: String, maxlength: 500 })
  ratingComment?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ConsultationSchema = SchemaFactory.createForClass(Consultation);

ConsultationSchema.index({ status: 1, priority: 1, createdAt: 1 });
