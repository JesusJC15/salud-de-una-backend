import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Consultation,
  ConsultationDocument,
} from '../consultations/schemas/consultation.schema';
import { DoctorStatus } from '../common/enums/doctor-status.enum';
import { Doctor, DoctorDocument } from '../doctors/schemas/doctor.schema';
import {
  Followup,
  FollowupDocument,
} from '../followups/schemas/followup.schema';
import {
  Notification,
  NotificationDocument,
} from '../notifications/schemas/notification.schema';
import { Patient, PatientDocument } from '../patients/schemas/patient.schema';
import {
  TriageSession,
  TriageSessionDocument,
} from '../triage/schemas/triage-session.schema';
import { TechnicalMetricsService } from './metrics/technical-metrics.service';
import { RequestMetric } from './metrics/technical-metrics.types';

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Patient.name)
    private readonly patientModel: Model<PatientDocument>,
    @InjectModel(Doctor.name)
    private readonly doctorModel: Model<DoctorDocument>,
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    @InjectModel(Consultation.name)
    private readonly consultationModel: Model<ConsultationDocument>,
    @InjectModel(TriageSession.name)
    private readonly triageSessionModel: Model<TriageSessionDocument>,
    @InjectModel(Followup.name)
    private readonly followupModel: Model<FollowupDocument>,
    private readonly technicalMetricsService: TechnicalMetricsService,
  ) {}

  async record(metric: RequestMetric): Promise<void> {
    await this.technicalMetricsService.record(metric);
  }

  async getTechnicalMetrics() {
    return this.technicalMetricsService.getSummary();
  }

  async getBusinessMetrics() {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [doctorAgg, patientAgg, notificationAgg] = await Promise.all([
      this.doctorModel.aggregate([
        {
          $group: {
            _id: null,
            totalDoctors: { $sum: 1 },
            verifiedDoctors: {
              $sum: {
                $cond: [
                  { $eq: ['$doctorStatus', DoctorStatus.VERIFIED] },
                  1,
                  0,
                ],
              },
            },
            pendingDoctors: {
              $sum: {
                $cond: [{ $eq: ['$doctorStatus', DoctorStatus.PENDING] }, 1, 0],
              },
            },
            rejectedDoctors: {
              $sum: {
                $cond: [
                  { $eq: ['$doctorStatus', DoctorStatus.REJECTED] },
                  1,
                  0,
                ],
              },
            },
            newDoctorsLast7Days: {
              $sum: {
                $cond: [{ $gte: ['$createdAt', sevenDaysAgo] }, 1, 0],
              },
            },
          },
        },
      ]),
      this.patientModel.aggregate([
        {
          $group: {
            _id: null,
            totalPatients: { $sum: 1 },
            newPatientsLast7Days: {
              $sum: {
                $cond: [{ $gte: ['$createdAt', sevenDaysAgo] }, 1, 0],
              },
            },
          },
        },
      ]),
      this.notificationModel.aggregate([
        { $match: { read: false } },
        { $count: 'unreadNotifications' },
      ]),
    ]);

    const productKpis = await this.buildProductKpis();

    const doctorStats = (doctorAgg[0] ?? {}) as {
      totalDoctors?: number;
      verifiedDoctors?: number;
      pendingDoctors?: number;
      rejectedDoctors?: number;
      newDoctorsLast7Days?: number;
    };

    const patientStats = (patientAgg[0] ?? {}) as {
      totalPatients?: number;
      newPatientsLast7Days?: number;
    };

    const notificationStats = (notificationAgg[0] ?? {}) as {
      unreadNotifications?: number;
    };

    const totalDoctors = doctorStats.totalDoctors ?? 0;
    const verifiedDoctors = doctorStats.verifiedDoctors ?? 0;
    const pendingDoctors = doctorStats.pendingDoctors ?? 0;
    const rejectedDoctors = doctorStats.rejectedDoctors ?? 0;
    const newDoctorsLast7Days = doctorStats.newDoctorsLast7Days ?? 0;

    const totalPatients = patientStats.totalPatients ?? 0;
    const newPatientsLast7Days = patientStats.newPatientsLast7Days ?? 0;

    const unreadNotifications = notificationStats.unreadNotifications ?? 0;
    return {
      generatedAt: new Date().toISOString(),
      kpis: {
        totalPatients,
        totalDoctors,
        verifiedDoctors,
        pendingDoctors,
      },
      productKpis,
      doctorStatusBreakdown: {
        verified: verifiedDoctors,
        pending: pendingDoctors,
        rejected: rejectedDoctors,
      },
      growthLast7Days: {
        patients: newPatientsLast7Days,
        doctors: newDoctorsLast7Days,
      },
      operationalSignals: {
        unreadNotifications,
        verificationCoverage:
          totalDoctors > 0
            ? Number(((verifiedDoctors / totalDoctors) * 100).toFixed(2))
            : 0,
      },
    };
  }

  async getConsultationMetrics() {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const consultations = await this.consultationModel
      .find({})
      .select(
        'specialty priority status createdAt closedAt assignedAt assignedDoctorId',
      )
      .lean()
      .exec();

    const doctorIds = consultations
      .map((consultation) => consultation.assignedDoctorId?.toString())
      .filter(Boolean) as string[];
    const doctors = doctorIds.length
      ? await this.doctorModel
          .find({ _id: { $in: doctorIds } })
          .select('firstName lastName specialty')
          .lean()
          .exec()
      : [];
    const doctorMap = new Map(
      doctors.map((doctor) => [
        doctor._id.toString(),
        {
          name: `${doctor.firstName} ${doctor.lastName}`.trim(),
          specialty: doctor.specialty,
        },
      ]),
    );

    const totalConsultations = consultations.length;
    const statusBreakdown = {
      pending: consultations.filter((item) => item.status === 'PENDING').length,
      inAttention: consultations.filter(
        (item) => item.status === 'IN_ATTENTION',
      ).length,
      closed: consultations.filter((item) => item.status === 'CLOSED').length,
    };
    const closedConsultations = consultations.filter(
      (item) => item.status === 'CLOSED' && item.closedAt,
    );
    const closedLast7Days = closedConsultations.filter(
      (item) => item.closedAt && item.closedAt >= sevenDaysAgo,
    ).length;

    const closedWithAssignedAt = closedConsultations.filter(
      (item) => item.assignedAt && item.closedAt,
    );
    const avgAttentionTimeMinutes =
      closedWithAssignedAt.length > 0
        ? Number(
            (
              closedWithAssignedAt.reduce((total, item) => {
                return (
                  total +
                  (item.closedAt!.getTime() - item.assignedAt!.getTime()) /
                    60_000
                );
              }, 0) / closedWithAssignedAt.length
            ).toFixed(2),
          )
        : null;
    const slaCompliance =
      closedWithAssignedAt.length > 0
        ? Number(
            (
              (closedWithAssignedAt.filter(
                (item) =>
                  item.closedAt!.getTime() - item.assignedAt!.getTime() <=
                  120 * 60_000,
              ).length /
                closedWithAssignedAt.length) *
              100
            ).toFixed(2),
          )
        : null;

    const specialties = new Map<
      string,
      { specialty: string; total: number; closed: number }
    >();
    for (const consultation of consultations) {
      const current = specialties.get(consultation.specialty) ?? {
        specialty: consultation.specialty,
        total: 0,
        closed: 0,
      };
      current.total += 1;
      if (consultation.status === 'CLOSED') {
        current.closed += 1;
      }
      specialties.set(consultation.specialty, current);
    }

    const topDoctorsMap = new Map<
      string,
      { doctorId: string; closed: number; name: string; specialty?: string }
    >();
    for (const consultation of closedConsultations) {
      const doctorId = consultation.assignedDoctorId?.toString();
      if (!doctorId) {
        continue;
      }
      const doctor = doctorMap.get(doctorId);
      const current = topDoctorsMap.get(doctorId) ?? {
        doctorId,
        closed: 0,
        name: doctor?.name ?? 'Doctor sin nombre',
        specialty: doctor?.specialty,
      };
      current.closed += 1;
      topDoctorsMap.set(doctorId, current);
    }

    return {
      generatedAt: new Date().toISOString(),
      statusBreakdown,
      totalConsultations,
      closedLast7Days,
      avgAttentionTimeMinutes,
      slaCompliance,
      bySpecialty: Array.from(specialties.values()),
      topDoctors: Array.from(topDoctorsMap.values())
        .sort((left, right) => right.closed - left.closed)
        .slice(0, 5),
    };
  }

  async getAlerts() {
    const [technical, business, consultations] = await Promise.all([
      this.getTechnicalMetrics(),
      this.getBusinessMetrics(),
      this.getConsultationMetrics(),
    ]);

    const alerts: Array<{
      key: string;
      level: 'OK' | 'WARNING' | 'CRITICAL';
      message: string;
    }> = [];

    if (technical.p95LatencyMs > 1_500) {
      alerts.push({
        key: 'technical-p95',
        level: technical.p95LatencyMs > 2_000 ? 'CRITICAL' : 'WARNING',
        message: `Latencia P95 ${technical.p95LatencyMs} ms`,
      });
    }

    if (technical.errorRate > 0.02) {
      alerts.push({
        key: 'technical-error-rate',
        level: technical.errorRate > 0.05 ? 'CRITICAL' : 'WARNING',
        message: `Error rate ${(technical.errorRate * 100).toFixed(2)}%`,
      });
    }

    if (
      consultations.slaCompliance !== null &&
      consultations.slaCompliance < 80
    ) {
      alerts.push({
        key: 'consultation-sla',
        level: consultations.slaCompliance < 60 ? 'CRITICAL' : 'WARNING',
        message: `Cumplimiento SLA ${consultations.slaCompliance}%`,
      });
    }

    for (const kpi of business.productKpis) {
      if (kpi.state !== 'OK') {
        alerts.push({
          key: `kpi-${kpi.key}`,
          level: kpi.state,
          message: `${kpi.label}: ${kpi.value}${kpi.unit ?? ''}`,
        });
      }
    }

    if (alerts.length === 0) {
      alerts.push({
        key: 'system-ok',
        level: 'OK',
        message: 'Sin alertas activas',
      });
    }

    return {
      generatedAt: new Date().toISOString(),
      items: alerts,
    };
  }

  private async buildProductKpis() {
    const [consultations, triageSessions, followups] = await Promise.all([
      this.consultationModel
        .find({})
        .select(
          'triageSessionId assignedAt createdAt closedAt summaryFeedback redFlagsConfirmed',
        )
        .lean()
        .exec(),
      this.triageSessionModel
        .find({})
        .select('analysis.redFlags')
        .lean()
        .exec(),
      this.followupModel
        .find({ status: 'COMPLETED' })
        .select('consultationId submittedAt')
        .lean()
        .exec(),
    ]);

    const triageMap = new Map(
      triageSessions.map((session) => [session._id.toString(), session]),
    );
    const followupsByConsultation = new Map<string, Date[]>();
    for (const followup of followups) {
      const key = followup.consultationId.toString();
      const current = followupsByConsultation.get(key) ?? [];
      if (followup.submittedAt) {
        current.push(followup.submittedAt);
      }
      followupsByConsultation.set(key, current);
    }

    const assignedConsultations = consultations.filter(
      (consultation) => consultation.assignedAt && consultation.createdAt,
    );
    const firstResponseMinutes =
      assignedConsultations.length > 0
        ? Number(
            (
              assignedConsultations.reduce((total, consultation) => {
                return (
                  total +
                  (consultation.assignedAt!.getTime() -
                    consultation.createdAt!.getTime()) /
                    60_000
                );
              }, 0) / assignedConsultations.length
            ).toFixed(2),
          )
        : 0;

    const consultationsWithFeedback = consultations.filter(
      (consultation) => consultation.summaryFeedback?.value,
    );
    const summaryUtility =
      consultationsWithFeedback.length > 0
        ? Number(
            (
              (consultationsWithFeedback.filter(
                (consultation) =>
                  consultation.summaryFeedback?.value === 'USEFUL',
              ).length /
                consultationsWithFeedback.length) *
              100
            ).toFixed(2),
          )
        : 0;

    const consultationsWithRedFlags = consultations.filter((consultation) => {
      const triage = triageMap.get(consultation.triageSessionId.toString());
      return (triage?.analysis?.redFlags?.length ?? 0) > 0;
    });
    const redFlagsConfirmed =
      consultationsWithRedFlags.length > 0
        ? Number(
            (
              (consultationsWithRedFlags.filter(
                (consultation) => consultation.redFlagsConfirmed === true,
              ).length /
                consultationsWithRedFlags.length) *
              100
            ).toFixed(2),
          )
        : 0;

    const closedConsultations = consultations.filter(
      (consultation) => consultation.closedAt,
    );
    const followupRetention =
      closedConsultations.length > 0
        ? Number(
            (
              (closedConsultations.filter((consultation) => {
                const followupDates =
                  followupsByConsultation.get(consultation._id.toString()) ??
                  [];
                return followupDates.some(
                  (submittedAt) =>
                    consultation.closedAt &&
                    submittedAt.getTime() <=
                      consultation.closedAt.getTime() + 7 * 24 * 60 * 60 * 1000,
                );
              }).length /
                closedConsultations.length) *
              100
            ).toFixed(2),
          )
        : 0;

    return [
      this.makeKpi(
        'time_to_first_response',
        'Tiempo a primera respuesta médica',
        firstResponseMinutes,
        30,
        'min',
        'Promedio(timestamp_primera_respuesta - timestamp_apertura)',
        'Consultations',
        true,
      ),
      this.makeKpi(
        'summary_utility',
        'Utilidad de resumen clínico',
        summaryUtility,
        75,
        '%',
        '% de consultas donde médico marca resumen como útil',
        'Feedback médico',
      ),
      this.makeKpi(
        'red_flags_confirmed',
        'Red flags relevantes confirmadas',
        redFlagsConfirmed,
        60,
        '%',
        '% de red flags confirmadas por médico',
        'Triage + validación médico',
      ),
      this.makeKpi(
        'followup_retention_7d',
        'Retención de seguimiento 7 días',
        followupRetention,
        50,
        '%',
        '% de pacientes que completan seguimiento en 7 días',
        'FollowUp records',
      ),
    ];
  }

  private makeKpi(
    key: string,
    label: string,
    value: number,
    target: number,
    unit: string,
    formula: string,
    source: string,
    lowerIsBetter = false,
  ) {
    let state: 'OK' | 'WARNING' | 'CRITICAL' = 'OK';
    if (lowerIsBetter) {
      if (value > target) {
        state = value > target * 1.5 ? 'CRITICAL' : 'WARNING';
      }
    } else if (value < target) {
      state = value < target * 0.8 ? 'CRITICAL' : 'WARNING';
    }

    return {
      key,
      label,
      value,
      target,
      unit,
      formula,
      source,
      state,
    };
  }
}
