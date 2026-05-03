import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Consultation } from '../consultations/schemas/consultation.schema';
import { DashboardService } from './dashboard.service';
import { Doctor } from '../doctors/schemas/doctor.schema';
import { Notification } from '../notifications/schemas/notification.schema';
import { Patient } from '../patients/schemas/patient.schema';
import { TechnicalMetricsService } from './metrics/technical-metrics.service';

describe('DashboardService', () => {
  let service: DashboardService;
  const doctorModel = { aggregate: jest.fn() };
  const patientModel = { aggregate: jest.fn() };
  const notificationModel = { aggregate: jest.fn() };
  const consultationModel = { aggregate: jest.fn(), countDocuments: jest.fn() };
  const technicalMetricsService = {
    record: jest.fn(),
    getSummary: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: getModelToken(Patient.name), useValue: patientModel },
        { provide: getModelToken(Doctor.name), useValue: doctorModel },
        {
          provide: getModelToken(Notification.name),
          useValue: notificationModel,
        },
        {
          provide: getModelToken(Consultation.name),
          useValue: consultationModel,
        },
        {
          provide: TechnicalMetricsService,
          useValue: technicalMetricsService,
        },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  it('record should delegate to technical metrics service', async () => {
    technicalMetricsService.getSummary.mockResolvedValue({
      sampleSize: 6,
      p95LatencyMs: 500,
      errorRate: 16.67,
      timestamp: '2026-03-14T12:00:00.000Z',
      source: 'memory',
      degraded: false,
    });

    for (let i = 0; i < 5; i += 1) {
      await service.record({ latencyMs: 100 + i, statusCode: 200 });
    }
    await service.record({ latencyMs: 500, statusCode: 500 });

    const metrics = await service.getTechnicalMetrics();

    expect(technicalMetricsService.record).toHaveBeenCalledTimes(6);
    expect(metrics.sampleSize).toBe(6);
    expect(metrics.p95LatencyMs).toBeGreaterThan(0);
    expect(metrics.errorRate).toBeGreaterThan(0);
  });

  it('getTechnicalMetrics should return zeros when no metrics', async () => {
    technicalMetricsService.getSummary.mockResolvedValue({
      sampleSize: 0,
      p95LatencyMs: 0,
      errorRate: 0,
      timestamp: '2026-03-14T12:00:00.000Z',
      source: 'memory',
      degraded: true,
    });

    const metrics = await service.getTechnicalMetrics();
    expect(metrics.sampleSize).toBe(0);
    expect(metrics.p95LatencyMs).toBe(0);
    expect(metrics.errorRate).toBe(0);
  });

  it('getBusinessMetrics should return aggregated data', async () => {
    doctorModel.aggregate.mockResolvedValue([
      {
        totalDoctors: 2,
        verifiedDoctors: 1,
        pendingDoctors: 1,
        rejectedDoctors: 0,
        newDoctorsLast7Days: 1,
      },
    ]);
    patientModel.aggregate.mockResolvedValue([
      { totalPatients: 3, newPatientsLast7Days: 2 },
    ]);
    notificationModel.aggregate.mockResolvedValue([{ unreadNotifications: 4 }]);

    const result = await service.getBusinessMetrics();

    expect(result.kpis).toMatchObject({
      totalPatients: 3,
      totalDoctors: 2,
      verifiedDoctors: 1,
      pendingDoctors: 1,
    });
    expect(result.operationalSignals).toMatchObject({
      unreadNotifications: 4,
      verificationCoverage: 50,
    });
  });

  it('getBusinessMetrics should handle empty aggregates', async () => {
    doctorModel.aggregate.mockResolvedValue([{}]);
    patientModel.aggregate.mockResolvedValue([{}]);
    notificationModel.aggregate.mockResolvedValue([]);

    const result = await service.getBusinessMetrics();

    expect(result.operationalSignals).toMatchObject({
      unreadNotifications: 0,
      verificationCoverage: 0,
    });
  });

  it('getBusinessMetrics should handle all null/undefined stats', async () => {
    doctorModel.aggregate.mockResolvedValue([undefined]);
    patientModel.aggregate.mockResolvedValue([undefined]);
    notificationModel.aggregate.mockResolvedValue([undefined]);

    const result = await service.getBusinessMetrics();

    expect(result.kpis.totalDoctors).toBe(0);
    expect(result.kpis.verifiedDoctors).toBe(0);
    expect(result.kpis.pendingDoctors).toBe(0);

    expect(result.doctorStatusBreakdown.rejected).toBe(0);

    expect(result.kpis.totalPatients).toBe(0);
    expect(result.operationalSignals.unreadNotifications).toBe(0);
    expect(result.operationalSignals.verificationCoverage).toBe(0);
  });
});
