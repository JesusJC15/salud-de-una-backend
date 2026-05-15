import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { UserRole } from '../../common/enums/user-role.enum';
import { UserGender } from '../../common/enums/user-gender.enum';

export type PatientDocument = HydratedDocument<Patient>;

@Schema({ timestamps: true })
export class Patient {
  @Prop({ required: true, trim: true })
  firstName!: string;

  @Prop({ required: true, trim: true })
  lastName!: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ unique: true, sparse: true, index: true, trim: true })
  auth0Subject?: string;

  @Prop({ required: true, select: false })
  passwordHash!: string;

  @Prop({ type: String, enum: UserRole, default: UserRole.PATIENT })
  role!: UserRole;

  @Prop({ type: Date, default: null })
  birthDate?: Date | null;

  @Prop({ type: String, enum: UserGender })
  gender?: UserGender;

  @Prop({ type: Number, min: 30, max: 260 })
  heightCm?: number;

  @Prop({ type: Number, min: 1, max: 400 })
  weightKg?: number;

  bmi?: number | null;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ type: [String], default: [] })
  pushTokens!: string[];

  @Prop({ type: String })
  expoPushToken?: string;

  @Prop({ type: Date, default: null })
  termsAcceptedAt?: Date | null;

  @Prop({ default: false })
  isAnonymized!: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const PatientSchema = SchemaFactory.createForClass(Patient);
