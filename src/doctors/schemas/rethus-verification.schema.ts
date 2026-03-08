import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ProgramType } from '../../common/enums/program-type.enum';
import { RethusState } from '../../common/enums/rethus-state.enum';
import { DoctorStatus } from '../../common/enums/doctor-status.enum';
import { TitleObtainingOrigin } from '../../common/enums/title-obtaining-origin.enum';

export type RethusVerificationDocument = HydratedDocument<RethusVerification>;

@Schema({ timestamps: true })
export class RethusVerification {
  @Prop({ type: Types.ObjectId, ref: 'Doctor', required: true })
  doctorId!: Types.ObjectId;

  @Prop({ type: String, enum: DoctorStatus, required: true })
  status!: DoctorStatus;

  @Prop({ type: String, enum: ProgramType, required: true })
  programType!: ProgramType;

  @Prop({ type: String, enum: TitleObtainingOrigin, required: true })
  titleObtainingOrigin!: TitleObtainingOrigin;

  @Prop({ required: true, trim: true })
  professionOccupation!: string;

  @Prop({ required: true })
  startDate!: Date;

  @Prop({ type: String, enum: RethusState, required: true })
  rethusState!: RethusState;

  @Prop({ required: true, trim: true })
  administrativeAct!: string;

  @Prop({ required: true, trim: true })
  reportingEntity!: string;

  @Prop({ required: true, trim: true })
  checkedBy!: string;

  @Prop({ required: true })
  checkedAt!: Date;

  @Prop()
  evidenceUrl?: string;

  @Prop()
  notes?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const RethusVerificationSchema =
  SchemaFactory.createForClass(RethusVerification);
RethusVerificationSchema.index({ doctorId: 1, checkedAt: -1 });
