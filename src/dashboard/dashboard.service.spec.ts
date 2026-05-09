import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Consultation } from '../consultations/schemas/consultation.schema';
import { Doctor } from '../doctors/schemas/doctor.schema';
import { Followup } from '../followups/schemas/followup.schema';
import { KnowledgeDocument } from '../knowledge/schemas/knowledge-document.schema';
import { KnowledgeJob } from '../knowledge/schemas/knowledge-job.schema';
import { Notification } from '../notifications/schemas/notification.schema';
import { Patient } from '../patients/schemas/patient.schema';
import { RagFeedback } from '../rag/schemas/rag-feedback.schema';
import { RagTrace } from '../rag/schemas/rag-trace.schema';
import { TriageSession } from '../triage/schemas/triage-session.schema';
import { DashboardService } from './dashboard.service';
import { TechnicalMetricsService } from './metrics/technical-metrics.service';

function createQueryMock<T>(initialValue: T) {
  const query = {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    exec: jest.fn<Promise<T>, []>().mockResolvedValue(initialValue),
  };

  return query;
}

describe('DashboardService', () => {
  let service: DashboardService;

  const consultationQuery = createQueryMock<unknown[]>([]);
  const doctorFindQuery = createQueryMock<unknown[]>([]);
  const triageSessionQuery = createQueryMock<unknown[]>([]);
  const followupQuery = createQueryMock<unknown[]>([]);
  const knowledgeDocumentQuery = createQueryMock<unknown[]>([]);
  const knowledgeJobQuery = createQueryMock<unknown[]>([]);
  const ragTraceQuery = createQueryMock<unknown[]>([]);
  const ragFeedbackQuery = createQueryMock<unknown[]>([]);

  const doctorModel = {
    aggregate: jest.fn(),
    find: jest.fn(() => doctorFindQuery),
  };
  const patientModel = { aggregate: jest.fn() };
  const notificationModel = { aggregate: jest.fn() };
  const consultationModel = {
    find: jest.fn(() => consultationQuery),
  };
  const triageSessionModel = {
    find: jest.fn(() => triageSessionQuery),
  };
  const followupModel = {
    find: jest.fn(() => followupQuery),
  };
  const knowledgeDocumentModel = {
    find: jest.fn(() => knowledgeDocumentQuery),
  };
  const knowledgeJobModel = {
    find: jest.fn(() => knowledgeJobQuery),
  };
  const ragTraceModel = {
    find: jest.fn(() => ragTraceQuery),
  };
  const ragFeedbackModel = {
    find: jest.fn(() => ragFeedbackQuery),
  };
  const technicalMetricsService = {
    record: jest.fn(),
    getSummary: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    consultationQuery.exec.mockResolvedValue([]);
    doctorFindQuery.exec.mockResolvedValue([]);
    triageSessionQuery.exec.mockResolvedValue([]);
    followupQuery.exec.mockResolvedValue([]);
    knowledgeDocumentQuery.exec.mockResolvedValue([]);
    knowledgeJobQuery.exec.mockResolvedValue([]);
    ragTraceQuery.exec.mockResolvedValue([]);
    ragFeedbackQuery.exec.mockResolvedValue([]);

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
          provide: getModelToken(KnowledgeDocument.name),
          useValue: knowledgeDocumentModel,
        },
        {
          provide: getModelToken(KnowledgeJob.name),
          useValue: knowledgeJobModel,
        },
        {
          provide: getModelToken(RagTrace.name),
          useValue: ragTraceModel,
        },
        {
          provide: getModelToken(RagFeedback.name),
          useValue: ragFeedbackModel,
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

    await expect(service.getTechnicalMetrics()).resolves.toMatchObject({
      sampleSize: 0,
      p95LatencyMs: 0,
      errorRate: 0,
    });
  });

  it('getBusinessMetrics should return aggregated data and product KPIs', async () => {
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

    expect(result.kpis).toMatchObject({
      totalPatients: 10,
      totalDoctors: 4,
      verifiedDoctors: 3,
      pendingDoctors: 1,
    });
    expect(result.operationalSignals).toMatchObject({
      unreadNotifications: 2,
      verificationCoverage: 75,
    });
    expect(result.productKpis.map((kpi) => kpi.key)).toEqual([
      'time_to_first_response',
      'summary_utility',
      'red_flags_confirmed',
      'followup_retention_7d',
    ]);
    expect(result.productKpis.map((kpi) => kpi.state)).toEqual([
      'CRITICAL',
      'CRITICAL',
      'OK',
      'OK',
    ]);
  });

  it('getBusinessMetrics should handle empty aggregates', async () => {
    doctorModel.aggregate.mockResolvedValue([{}]);
    patientModel.aggregate.mockResolvedValue([{}]);
    notificationModel.aggregate.mockResolvedValue([]);

    const result = await service.getBusinessMetrics();

    expect(result.kpis).toMatchObject({
      totalDoctors: 0,
      verifiedDoctors: 0,
      pendingDoctors: 0,
      totalPatients: 0,
    });
    expect(result.operationalSignals).toMatchObject({
      unreadNotifications: 0,
      verificationCoverage: 0,
    });
  });

  it('getBusinessMetrics should handle undefined aggregate items', async () => {
    doctorModel.aggregate.mockResolvedValue([undefined]);
    patientModel.aggregate.mockResolvedValue([undefined]);
    notificationModel.aggregate.mockResolvedValue([undefined]);

    const result = await service.getBusinessMetrics();

    expect(result.growthLast7Days).toEqual({
      patients: 0,
      doctors: 0,
    });
    expect(result.doctorStatusBreakdown).toEqual({
      verified: 0,
      pending: 0,
      rejected: 0,
    });
  });

  it('getConsultationMetrics should aggregate status, SLA and top doctors', async () => {
    consultationQuery.exec.mockResolvedValue([
      {
        _id: { toString: () => 'consult-1' },
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
        _id: { toString: () => 'consult-2' },
        specialty: 'GENERAL_MEDICINE',
        priority: 'LOW',
        status: 'PENDING',
        createdAt: new Date('2025-01-02T00:00:00.000Z'),
      },
    ]);
    doctorFindQuery.exec.mockResolvedValue([
      {
        _id: { toString: () => 'doctor-1' },
        firstName: 'Ana',
        lastName: 'Lopez',
        specialty: 'GENERAL_MEDICINE',
      },
    ]);

    const result = await service.getConsultationMetrics();

    expect(result.totalConsultations).toBe(2);
    expect(result.statusBreakdown).toEqual({
      pending: 1,
      inAttention: 0,
      closed: 1,
    });
    expect(result.avgAttentionTimeMinutes).toBe(60);
    expect(result.slaCompliance).toBe(100);
    expect(result.bySpecialty).toEqual([
      {
        specialty: 'GENERAL_MEDICINE',
        total: 2,
        closed: 1,
      },
    ]);
    expect(result.topDoctors[0]).toMatchObject({
      doctorId: 'doctor-1',
      closed: 1,
      name: 'Ana Lopez',
    });
  });

  it('getConsultationMetrics should return null KPIs when no closed consultation has assignment', async () => {
    consultationQuery.exec.mockResolvedValue([
      {
        _id: { toString: () => 'consult-1' },
        specialty: 'ODONTOLOGY',
        priority: 'LOW',
        status: 'IN_ATTENTION',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      },
      {
        _id: { toString: () => 'consult-2' },
        specialty: 'ODONTOLOGY',
        priority: 'LOW',
        status: 'CLOSED',
        createdAt: new Date('2025-01-02T00:00:00.000Z'),
        closedAt: new Date('2025-01-02T01:00:00.000Z'),
      },
    ]);

    const result = await service.getConsultationMetrics();

    expect(result.avgAttentionTimeMinutes).toBeNull();
    expect(result.slaCompliance).toBeNull();
    expect(result.topDoctors).toEqual([]);
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
      slaCompliance: null,
      bySpecialty: [],
      topDoctors: [],
    });

    const result = await service.getAlerts();

    expect(typeof result.generatedAt).toBe('string');
    expect(result.items).toEqual([
      {
        key: 'system-ok',
        level: 'OK',
        message: 'Sin alertas activas',
      },
    ]);
  });

  it('getRagMetrics should aggregate corpus, jobs, retrieval and feedback metrics', async () => {
    knowledgeDocumentQuery.exec.mockResolvedValue([
      { status: 'APPROVED' },
      { status: 'READY_FOR_REVIEW' },
      { status: 'SUSPENDED' },
    ]);
    knowledgeJobQuery.exec.mockResolvedValue([
      { status: 'FAILED' },
      { status: 'COMPLETED' },
    ]);
    ragTraceQuery.exec.mockResolvedValue([
      {
        grounded: true,
        fallback: false,
        selectedChunks: [{ chunkId: '1' }],
        totalLatencyMs: 180,
      },
      {
        grounded: false,
        fallback: true,
        selectedChunks: [],
        totalLatencyMs: 120,
      },
    ]);
    ragFeedbackQuery.exec.mockResolvedValue([
      { useful: true, grounded: true },
      { useful: false, grounded: true },
    ]);

    const result = await service.getRagMetrics();

    expect(result.corpus).toEqual({
      totalDocuments: 3,
      approvedDocuments: 1,
      pendingReview: 1,
      suspendedDocuments: 1,
    });
    expect(result.jobs).toEqual({
      totalLast24h: 2,
      failedLast24h: 1,
    });
    expect(result.retrieval).toEqual({
      totalLast24h: 2,
      groundedRate: 50,
      fallbackRate: 50,
      zeroHitRate: 50,
      avgLatencyMs: 150,
    });
    expect(result.feedback).toEqual({
      total: 2,
      usefulRate: 50,
      groundedRate: 100,
    });
  });

  it('getRagMetrics should return zeros when there is no recent RAG activity', async () => {
    const result = await service.getRagMetrics();

    expect(result.jobs).toEqual({
      totalLast24h: 0,
      failedLast24h: 0,
    });
    expect(result.retrieval).toEqual({
      totalLast24h: 0,
      groundedRate: 0,
      fallbackRate: 0,
      zeroHitRate: 0,
      avgLatencyMs: 0,
    });
    expect(result.feedback).toEqual({
      total: 0,
      usefulRate: 0,
      groundedRate: 0,
    });
  });

  it('getRagTraces should clamp the limit and map nullable fields', async () => {
    ragTraceQuery.exec.mockResolvedValue([
      {
        _id: { toString: () => 'trace-1' },
        correlationId: undefined,
        useCase: 'GENERAL',
        normalizedQuery: 'dolor de pecho',
        selectedChunks: [{ chunkId: '1' }],
        cacheHit: true,
        grounded: true,
        fallback: false,
        retrievalLatencyMs: 40,
        generationLatencyMs: 120,
        totalLatencyMs: 160,
        actorId: undefined,
        actorRole: undefined,
        answer: undefined,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      },
    ]);

    const result = await service.getRagTraces(500);

    expect(ragTraceQuery.limit).toHaveBeenCalledWith(100);
    expect(result).toEqual({
      items: [
        {
          id: 'trace-1',
          correlationId: null,
          useCase: 'GENERAL',
          normalizedQuery: 'dolor de pecho',
          selectedChunks: [{ chunkId: '1' }],
          cacheHit: true,
          grounded: true,
          fallback: false,
          retrievalLatencyMs: 40,
          generationLatencyMs: 120,
          totalLatencyMs: 160,
          actorId: null,
          actorRole: null,
          answer: null,
          createdAt: '2025-01-01T00:00:00.000Z',
        },
      ],
      total: 1,
    });
  });
});
