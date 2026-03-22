import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type NotificationDocument = HydratedDocument<Notification>;

@Schema({ timestamps: true })
export class Notification {
  @Prop({ type: Types.ObjectId, required: true })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  type!: string;

  @Prop({ required: true })
  status!: string;

  @Prop({ required: true })
  message!: string;

  @Prop({ unique: true, sparse: true, index: true })
  sourceEventId?: string;

  @Prop({ default: false })
  read!: boolean;

  @Prop()
  readAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
