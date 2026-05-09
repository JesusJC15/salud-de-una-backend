import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Specialty } from '../../common/enums/specialty.enum';

export type BillingPriceDocument = HydratedDocument<BillingPrice>;

@Schema({ timestamps: true })
export class BillingPrice {
  @Prop({ required: true, type: String, enum: Specialty, unique: true })
  specialty!: Specialty;

  @Prop({ required: true, min: 0 })
  amount!: number;

  @Prop({ required: true, default: 'COP' })
  currency!: string;

  @Prop({ default: true })
  active!: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const BillingPriceSchema = SchemaFactory.createForClass(BillingPrice);
