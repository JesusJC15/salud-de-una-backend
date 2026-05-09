import { Specialty } from '../common/enums/specialty.enum';
import { BillingController } from './billing.controller';

describe('BillingController', () => {
  const billingService = {
    getActivePrices: jest.fn(),
    initiateCheckout: jest.fn(),
    confirmCheckout: jest.fn(),
    getMyTransactions: jest.fn(),
    getTransactionById: jest.fn(),
    getAllTransactions: jest.fn(),
    getRevenueMetrics: jest.fn(),
    updatePrice: jest.fn(),
  };

  const user = { userId: 'patient-1' };

  let controller: BillingController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new BillingController(billingService as never);
  });

  it('delegates patient billing endpoints', () => {
    controller.getPrices();
    controller.initiateCheckout({ consultationId: 'consult-1' }, {
      user,
    } as never);
    controller.confirmCheckout('tx-1', { user } as never);
    controller.getMyTransactions({ user } as never);
    controller.getTransaction('tx-2', { user } as never);

    expect(billingService.getActivePrices).toHaveBeenCalledTimes(1);
    expect(billingService.initiateCheckout).toHaveBeenCalledWith(
      'consult-1',
      user,
    );
    expect(billingService.confirmCheckout).toHaveBeenCalledWith('tx-1', user);
    expect(billingService.getMyTransactions).toHaveBeenCalledWith(user);
    expect(billingService.getTransactionById).toHaveBeenCalledWith(
      'tx-2',
      user,
    );
  });

  it('delegates admin billing endpoints', () => {
    controller.getAllTransactions({
      from: '2025-01-01',
      to: '2025-01-31',
      specialty: Specialty.GENERAL_MEDICINE,
      status: 'COMPLETED',
      page: 2,
      limit: 10,
    } as never);
    controller.getRevenue();
    controller.getAdminPrices();
    controller.updatePrice('GENERAL_MEDICINE', { amount: 25000 });

    expect(billingService.getAllTransactions).toHaveBeenCalledWith({
      from: '2025-01-01',
      to: '2025-01-31',
      specialty: Specialty.GENERAL_MEDICINE,
      status: 'COMPLETED',
      page: 2,
      limit: 10,
    });
    expect(billingService.getRevenueMetrics).toHaveBeenCalled();
    expect(billingService.getActivePrices).toHaveBeenCalledTimes(1);
    expect(billingService.updatePrice).toHaveBeenCalledWith(
      Specialty.GENERAL_MEDICINE,
      25000,
    );
  });
});
