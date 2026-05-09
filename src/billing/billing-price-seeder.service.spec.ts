import { Logger } from '@nestjs/common';
import { BillingPriceSeederService } from './billing-price-seeder.service';

describe('BillingPriceSeederService', () => {
  const billingPriceModel = {
    findOne: jest.fn(),
    create: jest.fn(),
  };

  let service: BillingPriceSeederService;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    service = new BillingPriceSeederService(billingPriceModel as never);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('creates missing prices for all seeded specialties', async () => {
    billingPriceModel.findOne.mockReturnValue({
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(null),
    });

    await service.onApplicationBootstrap();

    expect(billingPriceModel.create).toHaveBeenCalledTimes(3);
    expect(billingPriceModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        currency: 'COP',
        active: true,
      }),
    );
    expect(logSpy).toHaveBeenCalledTimes(3);
  });

  it('skips specialties that already have a configured price', async () => {
    const exec = jest
      .fn()
      .mockResolvedValueOnce({ specialty: 'GENERAL_MEDICINE' })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ specialty: 'URGENT_CARE' });

    billingPriceModel.findOne.mockReturnValue({
      lean: jest.fn().mockReturnThis(),
      exec,
    });

    await service.onApplicationBootstrap();

    expect(billingPriceModel.create).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledTimes(1);
  });
});
