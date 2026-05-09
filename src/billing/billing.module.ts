import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Consultation,
  ConsultationSchema,
} from '../consultations/schemas/consultation.schema';
import { BillingController } from './billing.controller';
import { BillingPriceSeederService } from './billing-price-seeder.service';
import { BillingService } from './billing.service';
import {
  BillingPrice,
  BillingPriceSchema,
} from './schemas/billing-price.schema';
import { Transaction, TransactionSchema } from './schemas/transaction.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BillingPrice.name, schema: BillingPriceSchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: Consultation.name, schema: ConsultationSchema },
    ]),
  ],
  controllers: [BillingController],
  providers: [BillingService, BillingPriceSeederService],
  exports: [BillingService, MongooseModule],
})
export class BillingModule {}
