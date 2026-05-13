import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
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
    @Optional()
    @InjectConnection()
    private readonly connection: Connection | null,
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
        { upsert: true, returnDocument: 'after' },
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

    if (!price) {
      throw new BadRequestException(
        'No existe un precio activo configurado para esta especialidad',
      );
    }

    const [transaction] = await this.transactionModel.create([
      {
        patientId: new Types.ObjectId(user.userId),
        consultationId: new Types.ObjectId(consultationId),
        specialty: consultation.specialty,
        amount: price.amount,
        currency: price.currency ?? 'COP',
        status: 'PENDING',
      },
    ]);

    return this.toTransactionResponse(transaction.toObject());
  }

  async confirmCheckout(transactionId: string, user: RequestUser) {
    if (!this.connection?.startSession) {
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

      await this.consultationModel.findByIdAndUpdate(
        transaction.consultationId,
        {
          $set: { transactionId: transaction._id },
        },
      );

      this.logger.log(
        `Simulated payment confirmed for transaction ${transactionId}`,
      );

      return this.toTransactionResponse(transaction.toObject());
    }

    const session = await this.connection.startSession();
    let response: ReturnType<BillingService['toTransactionResponse']> | null =
      null;

    try {
      await session.withTransaction(async () => {
        const transaction = await this.transactionModel
          .findById(transactionId)
          .session(session)
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
        await transaction.save({ session });

        await this.consultationModel.updateOne(
          { _id: transaction.consultationId },
          {
            $set: { transactionId: transaction._id },
          },
          { session },
        );

        response = this.toTransactionResponse(transaction.toObject());
      });
    } finally {
      await session.endSession();
    }

    this.logger.log(
      `Simulated payment confirmed for transaction ${transactionId}`,
    );

    return response!;
  }

  async getMyTransactions(user: RequestUser) {
    const items = await this.transactionModel
      .find({ patientId: new Types.ObjectId(user.userId) })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return items.map((item) => this.toTransactionResponse(item));
  }

  async getTransactionById(id: string, user: RequestUser) {
    const transaction = await this.transactionModel.findById(id).lean().exec();
    if (!transaction) {
      throw new NotFoundException('Transacción no encontrada');
    }
    if (transaction.patientId.toString() !== user.userId) {
      throw new BadRequestException('No tienes acceso a esta transacción');
    }
    return this.toTransactionResponse(transaction);
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

    return {
      items: items.map((item) => this.toTransactionResponse(item)),
      total,
      page,
      limit,
    };
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
      paymentMode: 'SIMULATED',
      sandbox: true,
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

  private toTransactionResponse(
    transaction: Pick<
      Transaction,
      | 'patientId'
      | 'consultationId'
      | 'specialty'
      | 'amount'
      | 'currency'
      | 'status'
      | 'paidAt'
      | 'createdAt'
      | 'updatedAt'
    > & {
      _id?: Types.ObjectId;
      id?: string;
    },
  ) {
    return {
      id: transaction.id ?? transaction._id?.toString(),
      patientId: transaction.patientId.toString(),
      consultationId: transaction.consultationId.toString(),
      specialty: transaction.specialty,
      amount: transaction.amount,
      currency: transaction.currency,
      status: transaction.status,
      paidAt: transaction.paidAt ?? null,
      createdAt: transaction.createdAt ?? null,
      updatedAt: transaction.updatedAt ?? null,
      paymentMode: 'SIMULATED' as const,
      sandbox: true,
      message:
        'Cobro simulado: este flujo no representa una transacción financiera real.',
    };
  }
}
