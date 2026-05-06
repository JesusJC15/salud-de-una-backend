import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Consultation } from '../consultations/schemas/consultation.schema';
import { DashboardService } from './dashboard.service';
import { Doctor } from '../doctors/schemas/doctor.schema';
import { Followup } from '../followups/schemas/followup.schema';
import { Notification } from '../notifications/schemas/notification.schema';
import { Patient } from '../patients/schemas/patient.schema';
import { TechnicalMetricsService } from './metrics/technical-metrics.service';
import { TriageSession } from '../triage/schemas/triage-session.schema';

describe('DashboardService', () => {
  let service: DashboardService;
  const doctorModel = { aggregate: jest.fn() };
  const patientModel = { aggregate: jest.fn() };
  const notificationModel = { aggregate: jest.fn() };
  const consultationQuery = {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn(),
  };
  const triageSessionQuery = {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn(),
  };
  const followupQuery = {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn(),
  };
  const consultationModel = {
    find: jest.fn().mockReturnValue(consultationQuery),
  };
  const triageSessionModel = {
    find: jest.fn().mockReturnValue(triageSessionQuery),
  };
  const followupModel = {
    find: jest.fn().mockReturnValue(followupQuery),
  };
  const technicalMetricsService = {
    record: jest.fn(),
    getSummary: jest.fn(),
  };

  beforeEach(async () => {
    consultationQuery.exec.mockResolvedValue([]);
    triageSessionQuery.exec.mockResolvedValue([]);
    followupQuery.exec.mockResolvedValue([]);

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
          provide: getModelToken(TriageSession.name),
          useValue: triageSessionModel,
        },
        {
          provide: getModelToken(Followup.name),
          useValue: followupModel,
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

  it('getConsultationMetrics should aggregate status, SLA and top doctors', async () => {
    consultationQuery.exec.mockResolvedValue([
      {
        _id: new Date('2025-01-01T00:00:00.000Z'),
        specialty: 'GENERAL_MEDICINE',
        priority: 'HIGH',
        status: 'CLOSED',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        assignedAt: new Date('2025-01-01T00:30:00.000Z'),
        closedAt: new Date('2025-01-01T01:30:00.000Z'),
        assignedDoctorId: {
          toString: () => 'doctor-1',
        },
      },
      {
        _id: new Date('2025-01-02T00:00:00.000Z'),
        specialty: 'GENERAL_MEDICINE',
        priority: 'LOW',
        status: 'PENDING',
        createdAt: new Date('2025-01-02T00:00:00.000Z'),
      },
    ]);
    doctorModel.find = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([
        {
          _id: { toString: () => 'doctor-1' },
          firstName: 'Ana',
          lastName: 'Lopez',
          specialty: 'GENERAL_MEDICINE',
        },
      ]),
    });

    const result = await service.getConsultationMetrics();

    expect(result.totalConsultations).toBe(2);
    expect(result.statusBreakdown).toEqual({
      pending: 1,
      inAttention: 0,
      closed: 1,
    });
    expect(result.avgAttentionTimeMinutes).toBe(60);
    expect(result.slaCompliance).toBe(100);
    expect(result.topDoctors[0]).toMatchObject({
      doctorId: 'doctor-1',
      closed: 1,
      name: 'Ana Lopez',
    });
  });

  it('getAlerts should return warnings and critical items from metrics', async () => {
    jest.spyOn(service, 'getTechnicalMetrics').mockResolvedValue({
      sampleSize: 10,
      p95LatencyMs: 2100,
      errorRate: 0.08,
      timestamp: '2025-01-01T00:00:00.000Z',
      source: 'memory',
      degraded: false,
    });
    jest.spyOn(service, 'getBusinessMetrics').mockResolvedValue({
      generatedAt: '2025-01-01T00:00:00.000Z',
      kpis: {
        totalPatients: 10,
        totalDoctors: 5,
        verifiedDoctors: 4,
        pendingDoctors: 1,
      },
      productKpis: [
        {
          key: 'summary_utility',
          label: 'Utilidad resumen',
          value: 50,
          target: 75,
          unit: '%',
          formula: 'x',
          source: 'y',
          state: 'CRITICAL',
        },
      ],
      doctorStatusBreakdown: {
        verified: 4,
        pending: 1,
        rejected: 0,
      },
      growthLast7Days: {
        patients: 2,
        doctors: 1,
      },
      operationalSignals: {
        unreadNotifications: 3,
        verificationCoverage: 80,
      },
    });
    jest.spyOn(service, 'getConsultationMetrics').mockResolvedValue({
      generatedAt: '2025-01-01T00:00:00.000Z',
      statusBreakdown: {
        pending: 1,
        inAttention: 1,
        closed: 5,
      },
      totalConsultations: 7,
      closedLast7Days: 5,
      avgAttentionTimeMinutes: 90,
      slaCompliance: 55,
      bySpecialty: [],
      topDoctors: [],
    });

    const result = await service.getAlerts();

    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'technical-p95', level: 'CRITICAL' }),
        expect.objectContaining({
          key: 'technical-error-rate',
          level: 'CRITICAL',
        }),
        expect.objectContaining({
          key: 'consultation-sla',
          level: 'CRITICAL',
        }),
        expect.objectContaining({
          key: 'kpi-summary_utility',
          level: 'CRITICAL',
        }),
      ]),
    );
  });

  it('getBusinessMetrics should build product KPIs from consultations, triage and followups', async () => {
    doctorModel.aggregate.mockResolvedValue([
      {
        totalDoctors: 4,
        verifiedDoctors: 3,
        pendingDoctors: 1,
        rejectedDoctors: 0,
        newDoctorsLast7Days: 1,
      },
    ]);
    patientModel.aggregate.mockResolvedValue([
      { totalPatients: 10, newPatientsLast7Days: 2 },
    ]);
    notificationModel.aggregate.mockResolvedValue([{ unreadNotifications: 2 }]);
    consultationQuery.exec.mockResolvedValue([
      {
        _id: { toString: () => 'c1' },
        triageSessionId: { toString: () => 't1' },
        assignedAt: new Date('2025-01-01T00:30:00.000Z'),
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        closedAt: new Date('2025-01-02T00:00:00.000Z'),
        summaryFeedback: { value: 'USEFUL' },
        redFlagsConfirmed: true,
      },
      {
        _id: { toString: () => 'c2' },
        triageSessionId: { toString: () => 't2' },
        assignedAt: new Date('2025-01-01T01:30:00.000Z'),
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        closedAt: new Date('2025-01-10T00:00:00.000Z'),
        summaryFeedback: { value: 'NOT_USEFUL' },
        redFlagsConfirmed: false,
      },
    ]);
    triageSessionQuery.exec.mockResolvedValue([
      { _id: { toString: () => 't1' }, analysis: { redFlags: [{}] } },
      { _id: { toString: () => 't2' }, analysis: { redFlags: [] } },
    ]);
    followupQuery.exec.mockResolvedValue([
      {
        consultationId: { toString: () => 'c1' },
        submittedAt: new Date('2025-01-05T00:00:00.000Z'),
      },
    ]);

    const result = await service.getBusinessMetrics();

    expect(result.productKpis).toHaveLength(4);
    expect(result.productKpis.map((kpi) => kpi.key)).toEqual([
      'time_to_first_response',
      'summary_utility',
      'red_flags_confirmed',
      'followup_retention_7d',
    ]);
  });

  it('getAlerts should return OK when there are no active alerts', async () => {
    jest.spyOn(service, 'getTechnicalMetrics').mockResolvedValue({
      sampleSize: 10,
      p95LatencyMs: 500,
      errorRate: 0.01,
      timestamp: '2025-01-01T00:00:00.000Z',
      source: 'memory',
      degraded: false,
    });
    jest.spyOn(service, 'getBusinessMetrics').mockResolvedValue({
      generatedAt: '2025-01-01T00:00:00.000Z',
      kpis: {
        totalPatients: 10,
        totalDoctors: 5,
        verifiedDoctors: 5,
        pendingDoctors: 0,
      },
      productKpis: [
        {
          key: 'summary_utility',
          label: 'Utilidad resumen',
          value: 90,
          target: 75,
          unit: '%',
          formula: 'x',
          source: 'y',
          state: 'OK',
        },
      ],
      doctorStatusBreakdown: {
        verified: 5,
        pending: 0,
        rejected: 0,
      },
      growthLast7Days: {
        patients: 2,
        doctors: 1,
      },
      operationalSignals: {
        unreadNotifications: 0,
        verificationCoverage: 100,
      },
    });
    jest.spyOn(service, 'getConsultationMetrics').mockResolvedValue({
      generatedAt: '2025-01-01T00:00:00.000Z',
      statusBreakdown: {
        pending: 0,
        inAttention: 1,
        closed: 10,
      },
      totalConsultations: 11,
      closedLast7Days: 10,
      avgAttentionTimeMinutes: 30,
      slaCompliance: 95,
      bySpecialty: [],
      topDoctors: [],
    });

    const result = await service.getAlerts();

    expect(result.items).toEqual([
      {
        key: 'system-ok',
        level: 'OK',
        message: 'Sin alertas activas',
      },
    ]);
  });
});
