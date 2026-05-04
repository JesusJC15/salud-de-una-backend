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

  @Prop({ required: true, select: false })
  passwordHash!: string;

  @Prop({ type: String, enum: UserRole, default: UserRole.PATIENT })
  role!: UserRole;

  @Prop({ type: Date, default: null })
  birthDate?: Date | null;

  @Prop({ type: String, enum: UserGender })
  gender?: UserGender;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ type: String })
  expoPushToken?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const PatientSchema = SchemaFactory.createForClass(Patient);
