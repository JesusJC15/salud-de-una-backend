import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Specialty } from '../common/enums/specialty.enum';
import { RequestUser } from '../common/interfaces/request-user.interface';
import {
  Consultation,
  ConsultationDocument,
} from '../consultations/schemas/consultation.schema';
import {
  BillingPrice,
  BillingPriceDocument,
} from './schemas/billing-price.schema';
import {
  Transaction,
  TransactionDocument,
  TransactionStatus,
} from './schemas/transaction.schema';

type MonthlyRevenueAggregate = {
  _id: null;
  totalRevenue: number;
  count: number;
};

type RevenueBySpecialtyAggregate = {
  _id: Specialty;
  totalRevenue: number;
  count: number;
};

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @InjectModel(BillingPrice.name)
    private readonly billingPriceModel: Model<BillingPriceDocument>,
    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,
    @InjectModel(Consultation.name)
    private readonly consultationModel: Model<ConsultationDocument>,
  ) {}

  async getActivePrices() {
    return this.billingPriceModel.find({ active: true }).lean().exec();
  }

  async updatePrice(specialty: Specialty, amount: number) {
    const price = await this.billingPriceModel
      .findOneAndUpdate(
        { specialty },
        { $set: { amount, active: true } },
        { upsert: true, new: true },
      )
      .lean()
      .exec();
    this.logger.log(`Updated price for ${specialty} to $${amount} COP`);
    return price;
  }

  async initiateCheckout(consultationId: string, user: RequestUser) {
    const consultation = await this.consultationModel
      .findById(consultationId)
      .lean()
      .exec();

    if (!consultation) {
      throw new NotFoundException('Consulta no encontrada');
    }

    if (consultation.patientId.toString() !== user.userId) {
      throw new BadRequestException('No tienes acceso a esta consulta');
    }

    if (consultation.status !== 'CLOSED') {
      throw new BadRequestException(
        'Solo puedes pagar una consulta que ya fue cerrada',
      );
    }

    const existing = await this.transactionModel
      .findOne({ consultationId: new Types.ObjectId(consultationId) })
      .lean()
      .exec();

    if (existing) {
      if (existing.status === 'COMPLETED') {
        throw new ConflictException('Esta consulta ya fue pagada');
      }
      return existing;
    }

    const price = await this.billingPriceModel
      .findOne({ specialty: consultation.specialty, active: true })
      .lean()
      .exec();

    const amount = price?.amount ?? 15000;

    const [transaction] = await this.transactionModel.create([
      {
        patientId: new Types.ObjectId(user.userId),
        consultationId: new Types.ObjectId(consultationId),
        specialty: consultation.specialty,
        amount,
        currency: price?.currency ?? 'COP',
        status: 'PENDING',
      },
    ]);

    return transaction;
  }

  async confirmCheckout(transactionId: string, user: RequestUser) {
    const transaction = await this.transactionModel
      .findById(transactionId)
      .exec();

    if (!transaction) {
      throw new NotFoundException('Transacción no encontrada');
    }

    if (transaction.patientId.toString() !== user.userId) {
      throw new BadRequestException('No tienes acceso a esta transacción');
    }

    if (transaction.status !== 'PENDING') {
      throw new BadRequestException(
        `No se puede confirmar una transacción con estado ${transaction.status}`,
      );
    }

    transaction.status = 'COMPLETED';
    transaction.paidAt = new Date();
    await transaction.save();

    await this.consultationModel.findByIdAndUpdate(transaction.consultationId, {
      $set: { transactionId: transaction._id },
    });

    this.logger.log(
      `Payment confirmed for consultation ${transaction.consultationId.toString()} — $${transaction.amount} COP`,
    );

    return transaction.toObject();
  }

  async getMyTransactions(user: RequestUser) {
    return this.transactionModel
      .find({ patientId: new Types.ObjectId(user.userId) })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async getTransactionById(id: string, user: RequestUser) {
    const transaction = await this.transactionModel.findById(id).lean().exec();
    if (!transaction) {
      throw new NotFoundException('Transacción no encontrada');
    }
    if (transaction.patientId.toString() !== user.userId) {
      throw new BadRequestException('No tienes acceso a esta transacción');
    }
    return transaction;
  }

  async getAllTransactions(params: {
    from?: string;
    to?: string;
    specialty?: Specialty;
    status?: TransactionStatus;
    page?: number;
    limit?: number;
  }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (params.specialty) filter.specialty = params.specialty;
    if (params.status) filter.status = params.status;
    if (params.from || params.to) {
      const dateFilter: Record<string, Date> = {};
      if (params.from) dateFilter.$gte = new Date(params.from);
      if (params.to) dateFilter.$lte = new Date(params.to);
      filter.createdAt = dateFilter;
    }

    const [items, total] = await Promise.all([
      this.transactionModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.transactionModel.countDocuments(filter),
    ]);

    return { items, total, page, limit };
  }

  async getRevenueMetrics() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [monthlyAgg, allTimeAgg] = await Promise.all([
      this.transactionModel.aggregate<MonthlyRevenueAggregate>([
        {
          $match: {
            status: 'COMPLETED',
            paidAt: { $gte: startOfMonth },
          },
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
      ]),
      this.transactionModel.aggregate<RevenueBySpecialtyAggregate>([
        { $match: { status: 'COMPLETED' } },
        {
          $group: {
            _id: '$specialty',
            totalRevenue: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);
    const currentMonth = monthlyAgg[0];

    return {
      currentMonth: {
        totalRevenue: currentMonth?.totalRevenue ?? 0,
        paidConsultations: currentMonth?.count ?? 0,
        currency: 'COP',
      },
      bySpecialty: allTimeAgg.map((s) => ({
        specialty: s._id,
        totalRevenue: s.totalRevenue,
        count: s.count,
      })),
    };
  }
}
