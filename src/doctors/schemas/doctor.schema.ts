import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { DoctorStatus } from '../../common/enums/doctor-status.enum';
import { Specialty } from '../../common/enums/specialty.enum';
import { UserRole } from '../../common/enums/user-role.enum';

export type DoctorDocument = HydratedDocument<Doctor>;

@Schema({ timestamps: true })
export class Doctor {
  @Prop({ required: true, trim: true })
  firstName!: string;

  @Prop({ required: true, trim: true })
  lastName!: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ required: true, select: false })
  passwordHash!: string;

  @Prop({ type: String, enum: UserRole, default: UserRole.DOCTOR })
  role!: UserRole;

  @Prop({ type: String, enum: Specialty, required: true })
  specialty!: Specialty;

  @Prop({ required: true, unique: true, trim: true })
  personalId!: string;

  @Prop({ required: true, trim: true })
  phoneNumber!: string;

  @Prop()
  professionalLicense?: string;

  @Prop({ type: String, enum: DoctorStatus, default: DoctorStatus.PENDING })
  doctorStatus!: DoctorStatus;

  @Prop({ type: Types.ObjectId, ref: 'RethusVerification' })
  rethusVerification?: Types.ObjectId;

  @Prop({ default: true })
  isActive!: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const DoctorSchema = SchemaFactory.createForClass(Doctor);
