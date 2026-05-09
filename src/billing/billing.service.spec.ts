import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { UserRole } from '../common/enums/user-role.enum';
import { Specialty } from '../common/enums/specialty.enum';
import { Consultation } from '../consultations/schemas/consultation.schema';
import { BillingService } from './billing.service';
import { BillingPrice } from './schemas/billing-price.schema';
import { Transaction } from './schemas/transaction.schema';

const PATIENT_ID = new Types.ObjectId().toString();
const CONSULTATION_ID = new Types.ObjectId().toString();
const TRANSACTION_ID = new Types.ObjectId().toString();

const mockUser = {
  userId: PATIENT_ID,
  email: 'patient@example.com',
  role: UserRole.PATIENT,
  isActive: true,
};

function makeConsultation(overrides = {}) {
  return {
    _id: new Types.ObjectId(CONSULTATION_ID),
    patientId: new Types.ObjectId(PATIENT_ID),
    specialty: Specialty.GENERAL_MEDICINE,
    status: 'CLOSED',
    ...overrides,
  };
}

function makeTransaction(overrides = {}) {
  return {
    _id: new Types.ObjectId(TRANSACTION_ID),
    patientId: new Types.ObjectId(PATIENT_ID),
    consultationId: new Types.ObjectId(CONSULTATION_ID),
    specialty: Specialty.GENERAL_MEDICINE,
    amount: 15000,
    currency: 'COP',
    status: 'PENDING',
    paidAt: undefined as Date | undefined,
    save: jest.fn().mockResolvedValue(undefined),
    toObject: jest.fn().mockReturnThis(),
    ...overrides,
  };
}

describe('BillingService', () => {
  let service: BillingService;

  const billingPriceModel = {
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    create: jest.fn(),
  };
  const transactionModel = {
    find: jest.fn(),
    findById: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    countDocuments: jest.fn(),
    aggregate: jest.fn(),
  };
  const consultationModel = {
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        {
          provide: getModelToken(BillingPrice.name),
          useValue: billingPriceModel,
        },
        {
          provide: getModelToken(Transaction.name),
          useValue: transactionModel,
        },
        {
          provide: getModelToken(Consultation.name),
          useValue: consultationModel,
        },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
  });

  describe('getActivePrices', () => {
    it('returns active prices', async () => {
      const prices = [{ specialty: 'GENERAL_MEDICINE', amount: 15000 }];
      billingPriceModel.find.mockReturnValue({
        lean: () => ({ exec: () => Promise.resolve(prices) }),
      });

      const result = await service.getActivePrices();
      expect(result).toEqual(prices);
    });
  });

  describe('updatePrice', () => {
    it('upserts the price for a specialty', async () => {
      const updated = { specialty: 'GENERAL_MEDICINE', amount: 20000 };
      billingPriceModel.findOneAndUpdate.mockReturnValue({
        lean: () => ({ exec: () => Promise.resolve(updated) }),
      });

      const result = await service.updatePrice(
        Specialty.GENERAL_MEDICINE,
        20000,
      );
      expect(result).toEqual(updated);
      expect(billingPriceModel.findOneAndUpdate).toHaveBeenCalledWith(
        { specialty: Specialty.GENERAL_MEDICINE },
        { $set: { amount: 20000, active: true } },
        { upsert: true, new: true },
      );
    });
  });

  describe('initiateCheckout', () => {
    it('creates a PENDING transaction for a CLOSED consultation', async () => {
      const consultation = makeConsultation();
      const transaction = makeTransaction();

      consultationModel.findById.mockReturnValue({
        lean: () => ({ exec: () => Promise.resolve(consultation) }),
      });
      transactionModel.findOne.mockReturnValue({
        lean: () => ({ exec: () => Promise.resolve(null) }),
      });
      billingPriceModel.findOne.mockReturnValue({
        lean: () => ({
          exec: () => Promise.resolve({ amount: 15000, currency: 'COP' }),
        }),
      });
      transactionModel.create.mockResolvedValue([transaction]);

      const result = await service.initiateCheckout(CONSULTATION_ID, mockUser);
      expect(result).toBe(transaction);
    });

    it('throws NotFoundException when consultation not found', async () => {
      consultationModel.findById.mockReturnValue({
        lean: () => ({ exec: () => Promise.resolve(null) }),
      });
      await expect(
        service.initiateCheckout(CONSULTATION_ID, mockUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when consultation is not CLOSED', async () => {
      consultationModel.findById.mockReturnValue({
        lean: () => ({
          exec: () => Promise.resolve(makeConsultation({ status: 'PENDING' })),
        }),
      });
      await expect(
        service.initiateCheckout(CONSULTATION_ID, mockUser),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when patient does not own the consultation', async () => {
      const otherPatientId = new Types.ObjectId().toString();
      consultationModel.findById.mockReturnValue({
        lean: () => ({
          exec: () =>
            Promise.resolve(
              makeConsultation({
                patientId: new Types.ObjectId(otherPatientId),
              }),
            ),
        }),
      });
      await expect(
        service.initiateCheckout(CONSULTATION_ID, mockUser),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws ConflictException when consultation already paid', async () => {
      consultationModel.findById.mockReturnValue({
        lean: () => ({ exec: () => Promise.resolve(makeConsultation()) }),
      });
      transactionModel.findOne.mockReturnValue({
        lean: () => ({
          exec: () => Promise.resolve(makeTransaction({ status: 'COMPLETED' })),
        }),
      });
      await expect(
        service.initiateCheckout(CONSULTATION_ID, mockUser),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('returns existing PENDING transaction instead of creating a new one', async () => {
      const pendingTransaction = makeTransaction({ status: 'PENDING' });
      consultationModel.findById.mockReturnValue({
        lean: () => ({ exec: () => Promise.resolve(makeConsultation()) }),
      });
      transactionModel.findOne.mockReturnValue({
        lean: () => ({ exec: () => Promise.resolve(pendingTransaction) }),
      });

      const result = await service.initiateCheckout(CONSULTATION_ID, mockUser);
      expect(result).toBe(pendingTransaction);
      expect(transactionModel.create).not.toHaveBeenCalled();
    });
  });

  describe('confirmCheckout', () => {
    it('marks transaction as COMPLETED and updates consultation', async () => {
      const transaction = makeTransaction();
      transactionModel.findById.mockReturnValue({
        exec: () => Promise.resolve(transaction),
      });
      consultationModel.findByIdAndUpdate.mockResolvedValue(null);

      await service.confirmCheckout(TRANSACTION_ID, mockUser);
      expect(transaction.status).toBe('COMPLETED');
      expect(transaction.paidAt).toBeInstanceOf(Date);
      expect(transaction.save).toHaveBeenCalled();
    });

    it('throws NotFoundException when transaction not found', async () => {
      transactionModel.findById.mockReturnValue({
        exec: () => Promise.resolve(null),
      });
      await expect(
        service.confirmCheckout(TRANSACTION_ID, mockUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when transaction status is not PENDING', async () => {
      transactionModel.findById.mockReturnValue({
        exec: () => Promise.resolve(makeTransaction({ status: 'COMPLETED' })),
      });
      await expect(
        service.confirmCheckout(TRANSACTION_ID, mockUser),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getMyTransactions', () => {
    it('returns patient transactions sorted by date', async () => {
      const transactions = [makeTransaction()];
      transactionModel.find.mockReturnValue({
        sort: () => ({
          lean: () => ({ exec: () => Promise.resolve(transactions) }),
        }),
      });

      const result = await service.getMyTransactions(mockUser);
      expect(result).toEqual(transactions);
    });
  });

  describe('getRevenueMetrics', () => {
    it('returns monthly and by-specialty revenue', async () => {
      transactionModel.aggregate
        .mockResolvedValueOnce([{ totalRevenue: 45000, count: 3 }])
        .mockResolvedValueOnce([
          { _id: 'GENERAL_MEDICINE', totalRevenue: 45000, count: 3 },
        ]);

      const result = await service.getRevenueMetrics();
      expect(result.currentMonth.totalRevenue).toBe(45000);
      expect(result.currentMonth.paidConsultations).toBe(3);
      expect(result.bySpecialty).toHaveLength(1);
    });

    it('returns zeros when no completed transactions exist', async () => {
      transactionModel.aggregate
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getRevenueMetrics();
      expect(result.currentMonth.totalRevenue).toBe(0);
    });
  });
});
