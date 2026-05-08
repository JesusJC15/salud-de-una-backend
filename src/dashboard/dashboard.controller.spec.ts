import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from '../ai/ai.service';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { ErrorLogsService } from './error-logs.service';

describe('DashboardController', () => {
  let controller: DashboardController;
  let service: {
    getTechnicalMetrics: jest.Mock;
    getBusinessMetrics: jest.Mock;
    getConsultationMetrics: jest.Mock;
    getAlerts: jest.Mock;
  };
  let errorLogsService: { getRecent: jest.Mock };
  let aiService: { getUsageMetrics: jest.Mock };

  beforeEach(async () => {
    service = {
      getTechnicalMetrics: jest.fn(),
      getBusinessMetrics: jest.fn(),
      getConsultationMetrics: jest.fn(),
      getAlerts: jest.fn(),
    };
    errorLogsService = { getRecent: jest.fn().mockReturnValue([]) };
    aiService = { getUsageMetrics: jest.fn().mockResolvedValue({ total: 0 }) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        { provide: DashboardService, useValue: service },
        { provide: ErrorLogsService, useValue: errorLogsService },
        { provide: AiService, useValue: aiService },
      ],
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

  it('getConsultations should call service', async () => {
    service.getConsultationMetrics.mockResolvedValue({ totalConsultations: 2 });

    const result = await controller.getConsultations();

    expect(service.getConsultationMetrics).toHaveBeenCalled();
    expect(result).toEqual({ totalConsultations: 2 });
  });

  it('getAlerts should call service', async () => {
    service.getAlerts.mockResolvedValue({ items: [] });

    const result = await controller.getAlerts();

    expect(service.getAlerts).toHaveBeenCalled();
    expect(result).toEqual({ items: [] });
  });
});
