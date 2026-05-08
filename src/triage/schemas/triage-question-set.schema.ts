import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Specialty } from '../../common/enums/specialty.enum';
import { TRIAGE_QUESTION_TYPES } from '../triage.constants';

export type TriageQuestionSetDocument = HydratedDocument<TriageQuestionSet>;

@Schema({ _id: false })
export class TriageQuestionOptionEmbedded {
  @Prop({ required: true })
  id!: string;

  @Prop({ required: true })
  label!: string;

  @Prop()
  description?: string;
}

const TriageQuestionOptionEmbeddedSchema = SchemaFactory.createForClass(
  TriageQuestionOptionEmbedded,
);

@Schema({ _id: false })
export class TriageQuestionEmbedded {
  @Prop({ required: true })
  id!: string;

  @Prop({ required: true })
  questionId!: string;

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  questionText!: string;

  @Prop()
  description?: string;

  @Prop({ required: true, enum: TRIAGE_QUESTION_TYPES })
  type!: string;

  @Prop({ type: [TriageQuestionOptionEmbeddedSchema], default: [] })
  options?: TriageQuestionOptionEmbedded[];

  @Prop()
  minValue?: number;

  @Prop()
  maxValue?: number;

  @Prop()
  step?: number;
}

const TriageQuestionEmbeddedSchema =
  SchemaFactory.createForClass(TriageQuestionEmbedded);

@Schema({ timestamps: true })
export class TriageQuestionSet {
  @Prop({ required: true, type: String, enum: Specialty, index: true })
  specialty!: Specialty;

  @Prop({ required: true, min: 1, default: 1 })
  version!: number;

  @Prop({ default: true })
  active!: boolean;

  @Prop({ type: [TriageQuestionEmbeddedSchema], required: true })
  questions!: TriageQuestionEmbedded[];

  createdAt?: Date;
  updatedAt?: Date;
}

export const TriageQuestionSetSchema =
  SchemaFactory.createForClass(TriageQuestionSet);

TriageQuestionSetSchema.index({ specialty: 1, version: 1 }, { unique: true });
