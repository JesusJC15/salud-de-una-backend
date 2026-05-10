import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ErrorLogEntryDocument = HydratedDocument<ErrorLogRecord>;

@Schema({ timestamps: true, collection: 'error_logs' })
export class ErrorLogRecord {
  @Prop({ required: true, index: true })
  errorId!: string;

  @Prop({ required: true, index: true })
  statusCode!: number;

  @Prop({ required: true })
  method!: string;

  @Prop({ required: true })
  url!: string;

  @Prop()
  correlationId?: string;

  @Prop()
  userId?: string;

  @Prop({ required: true })
  errorMessage!: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ErrorLogRecordSchema = SchemaFactory.createForClass(ErrorLogRecord);
ErrorLogRecordSchema.index({ createdAt: -1 });
