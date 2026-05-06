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
  Notification,
  NotificationDocument,
} from '../notifications/schemas/notification.schema';
import { Patient, PatientDocument } from '../patients/schemas/patient.schema';
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
    private readonly technicalMetricsService: TechnicalMetricsService,
  ) {}

  async record(metric: RequestMetric): Promise<void> {
    await this.technicalMetricsService.record(metric);
  }

  async getTechnicalMetrics() {
    return this.technicalMetricsService.getSummary();
  }

  async getConsultationMetrics() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const SLA_LIMIT_MS = 120 * 60 * 1000; // 2 hours

    const [statusAgg, closedLast7Agg, timingAgg, specialtyAgg, topDoctorsAgg] =
      await Promise.all([
        // 1 — count by status
        this.consultationModel.aggregate([
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),

        // 2 — closed consultations in last 7 days
        this.consultationModel.countDocuments({
          status: 'CLOSED',
          closedAt: { $gte: sevenDaysAgo },
        }),

        // 3 — avg attention time + SLA compliance (only CLOSED with closedAt)
        this.consultationModel.aggregate([
          {
            $match: {
              status: 'CLOSED',
              closedAt: { $exists: true, $ne: null },
            },
          },
          {
            $project: {
              durationMs: { $subtract: ['$closedAt', '$createdAt'] },
            },
          },
          {
            $group: {
              _id: null,
              avgMs: { $avg: '$durationMs' },
              total: { $sum: 1 },
              slaOk: {
                $sum: {
                  $cond: [{ $lte: ['$durationMs', SLA_LIMIT_MS] }, 1, 0],
                },
              },
            },
          },
        ]),

        // 4 — total + closed by specialty
        this.consultationModel.aggregate([
          {
            $group: {
              _id: '$specialty',
              total: { $sum: 1 },
              closed: {
                $sum: { $cond: [{ $eq: ['$status', 'CLOSED'] }, 1, 0] },
              },
            },
          },
          { $sort: { total: -1 } },
        ]),

        // 5 — top 5 doctors by closed consultations
        this.consultationModel.aggregate([
          {
            $match: {
              status: 'CLOSED',
              assignedDoctorId: { $exists: true, $ne: null },
            },
          },
          { $group: { _id: '$assignedDoctorId', closed: { $sum: 1 } } },
          { $sort: { closed: -1 } },
          { $limit: 5 },
          {
            $lookup: {
              from: 'doctors',
              localField: '_id',
              foreignField: '_id',
              as: 'doctor',
            },
          },
          { $unwind: { path: '$doctor', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 0,
              doctorId: { $toString: '$_id' },
              name: {
                $cond: [
                  { $gt: ['$doctor', null] },
                  { $concat: ['$doctor.firstName', ' ', '$doctor.lastName'] },
                  'Médico desconocido',
                ],
              },
              specialty: '$doctor.specialty',
              closed: 1,
            },
          },
        ]),
      ]);

    // Build status breakdown map
    const statusMap: Record<string, number> = {};
    for (const row of statusAgg as { _id: string; count: number }[]) {
      statusMap[row._id] = row.count;
    }

    const timingRow = (timingAgg[0] ?? {}) as {
      avgMs?: number;
      total?: number;
      slaOk?: number;
    };
    const closedTotal = timingRow.total ?? 0;
    const avgAttentionMs = timingRow.avgMs ?? 0;
    const slaOk = timingRow.slaOk ?? 0;

    return {
      generatedAt: new Date().toISOString(),
      statusBreakdown: {
        pending: statusMap['PENDING'] ?? 0,
        inAttention: statusMap['IN_ATTENTION'] ?? 0,
        closed: statusMap['CLOSED'] ?? 0,
      },
      totalConsultations:
        (statusMap['PENDING'] ?? 0) +
        (statusMap['IN_ATTENTION'] ?? 0) +
        (statusMap['CLOSED'] ?? 0),
      closedLast7Days: closedLast7Agg,
      avgAttentionTimeMinutes:
        closedTotal > 0 ? Math.round(avgAttentionMs / 60_000) : null,
      slaCompliance:
        closedTotal > 0
          ? Number(((slaOk / closedTotal) * 100).toFixed(1))
          : null,
      bySpecialty: (
        specialtyAgg as { _id: string; total: number; closed: number }[]
      ).map((row) => ({
        specialty: row._id,
        total: row.total,
        closed: row.closed,
      })),
      topDoctors: topDoctorsAgg as {
        doctorId: string;
        name: string;
        specialty?: string;
        closed: number;
      }[],
    };
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
}
