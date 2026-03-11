import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { UserRole } from '../../common/enums/user-role.enum';

export type RefreshSessionDocument = HydratedDocument<RefreshSession>;

@Schema({ timestamps: true })
export class RefreshSession {
  @Prop({ required: true, unique: true, index: true })
  sessionId!: string;

  @Prop({ required: true, index: true })
  userId!: string;

  @Prop({ required: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ type: String, enum: UserRole, required: true, index: true })
  role!: UserRole;

  @Prop({ required: true })
  tokenHash!: string;

  @Prop({ required: true, index: true, expires: 0 })
  expiresAt!: Date;

  @Prop()
  revokedAt?: Date;

  @Prop()
  revokedReason?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const RefreshSessionSchema =
  SchemaFactory.createForClass(RefreshSession);
