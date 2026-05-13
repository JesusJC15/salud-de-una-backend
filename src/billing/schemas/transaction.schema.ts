import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Specialty } from '../../common/enums/specialty.enum';

export type TransactionStatus = 'PENDING' | 'COMPLETED' | 'REFUNDED';

export type TransactionDocument = HydratedDocument<Transaction>;

@Schema({ timestamps: true })
export class Transaction {
  @Prop({ required: true, type: Types.ObjectId, index: true })
  patientId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, index: true, unique: true })
  consultationId!: Types.ObjectId;

  @Prop({ required: true, type: String, enum: Specialty })
  specialty!: Specialty;

  @Prop({ required: true, min: 0 })
  amount!: number;

  @Prop({ required: true, default: 'COP' })
  currency!: string;

  @Prop({
    required: true,
    type: String,
    enum: ['PENDING', 'COMPLETED', 'REFUNDED'],
    default: 'PENDING',
  })
  status!: TransactionStatus;

  @Prop({ type: Date })
  paidAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);
TransactionSchema.index({ patientId: 1, status: 1 });
TransactionSchema.index({ status: 1, paidAt: -1 });
