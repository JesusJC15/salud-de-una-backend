import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';
import { UserRole } from '../../common/enums/user-role.enum';

export type AiAuditLogDocument = HydratedDocument<AiAuditLog>;

@Schema({ timestamps: true })
export class AiAuditLog {
  @Prop({ required: true })
  provider!: string;

  @Prop({ required: true })
  model!: string;

  @Prop({ required: true })
  promptKey!: string;

  @Prop({ required: true })
  promptVersion!: number;

  @Prop()
  actorId?: string;

  @Prop({ type: String, enum: UserRole })
  actorRole?: UserRole;

  @Prop()
  correlationId?: string;

  @Prop({ required: true, min: 0 })
  latencyMs!: number;

  @Prop({ required: true })
  status!: 'success' | 'error' | 'disabled';

  @Prop()
  errorCode?: string;

  @Prop({ required: true })
  sanitizedInputSummary!: string;

  @Prop({ required: true })
  sanitizedOutputSummary!: string;

  @Prop({ type: SchemaTypes.Mixed })
  tokenUsage?: Record<string, unknown>;

  createdAt?: Date;
  updatedAt?: Date;
}

export const AiAuditLogSchema = SchemaFactory.createForClass(AiAuditLog);
