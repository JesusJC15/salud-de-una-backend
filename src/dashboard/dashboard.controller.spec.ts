import { Test, TestingModule } from '@nestjs/testing';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

describe('DashboardController', () => {
  let controller: DashboardController;
  let service: {
    getTechnicalMetrics: jest.Mock;
    getBusinessMetrics: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      getTechnicalMetrics: jest.fn(),
      getBusinessMetrics: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [{ provide: DashboardService, useValue: service }],
    }).compile();

    controller = module.get<DashboardController>(DashboardController);
  });

  it('getTechnical should call service', () => {
    service.getTechnicalMetrics.mockReturnValue({ sampleSize: 0 });

    const result = controller.getTechnical();

    expect(service.getTechnicalMetrics).toHaveBeenCalled();
    expect(result).toEqual({ sampleSize: 0 });
  });

  it('getBusiness should call service', async () => {
    service.getBusinessMetrics.mockResolvedValue({ kpis: {} });

    const result = await controller.getBusiness();

    expect(service.getBusinessMetrics).toHaveBeenCalled();
    expect(result).toEqual({ kpis: {} });
  });
});
