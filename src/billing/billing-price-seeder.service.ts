import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Specialty } from '../common/enums/specialty.enum';
import {
  BillingPrice,
  BillingPriceDocument,
} from './schemas/billing-price.schema';

const INITIAL_PRICES: Array<{ specialty: Specialty; amount: number }> = [
  { specialty: Specialty.GENERAL_MEDICINE, amount: 15000 },
  { specialty: Specialty.ODONTOLOGY, amount: 12000 },
  { specialty: Specialty.URGENT_CARE, amount: 10000 },
];

@Injectable()
export class BillingPriceSeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BillingPriceSeederService.name);

  constructor(
    @InjectModel(BillingPrice.name)
    private readonly billingPriceModel: Model<BillingPriceDocument>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    for (const { specialty, amount } of INITIAL_PRICES) {
      const exists = await this.billingPriceModel
        .findOne({ specialty })
        .lean()
        .exec();

      if (!exists) {
        await this.billingPriceModel.create({
          specialty,
          amount,
          currency: 'COP',
          active: true,
        });
        this.logger.log(
          `Seeded billing price for ${specialty}: $${amount} COP`,
        );
      }
    }
  }
}
