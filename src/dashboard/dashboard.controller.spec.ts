import { DashboardController } from './dashboard.controller';

describe('DashboardController', () => {
  const dashboardService = {
    getTechnicalMetrics: jest.fn(),
    getBusinessMetrics: jest.fn(),
    getConsultationMetrics: jest.fn(),
    getAlerts: jest.fn(),
    getRagMetrics: jest.fn(),
    getRagTraces: jest.fn(),
  };
  const errorLogsService = {
    getRecent: jest.fn(),
  };
  const aiService = {
    getUsageMetrics: jest.fn(),
  };

  let controller: DashboardController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new DashboardController(
      dashboardService as never,
      errorLogsService as never,
      aiService as never,
    );
  });

  it('delegates metrics endpoints to their services', async () => {
    await controller.getTechnical();
    await controller.getBusiness();
    await controller.getConsultations();
    await controller.getAlerts();
    await controller.getAiMetrics();
    await controller.getRagMetrics();

    expect(dashboardService.getTechnicalMetrics).toHaveBeenCalled();
    expect(dashboardService.getBusinessMetrics).toHaveBeenCalled();
    expect(dashboardService.getConsultationMetrics).toHaveBeenCalled();
    expect(dashboardService.getAlerts).toHaveBeenCalled();
    expect(aiService.getUsageMetrics).toHaveBeenCalled();
    expect(dashboardService.getRagMetrics).toHaveBeenCalled();
  });

  it('uses default limits for errors and rag traces when query param is absent', () => {
    void controller.getRecentErrors();
    void controller.getRagTraces();

    expect(errorLogsService.getRecent).toHaveBeenCalledWith(20);
    expect(dashboardService.getRagTraces).toHaveBeenCalledWith(20);
  });

  it('parses custom limits for errors and rag traces', () => {
    void controller.getRecentErrors('15');
    void controller.getRagTraces('25');

    expect(errorLogsService.getRecent).toHaveBeenCalledWith(15);
    expect(dashboardService.getRagTraces).toHaveBeenCalledWith(25);
  });
});
