import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DoctorStatus } from '../common/enums/doctor-status.enum';
import { Doctor, DoctorDocument } from '../doctors/schemas/doctor.schema';
import {
  Notification,
  NotificationDocument,
} from '../notifications/schemas/notification.schema';
import { Patient, PatientDocument } from '../patients/schemas/patient.schema';

interface RequestMetric {
  latencyMs: number;
  statusCode: number;
}

@Injectable()
export class DashboardService {
  private readonly metrics: RequestMetric[] = [];

  constructor(
    @InjectModel(Patient.name)
    private readonly patientModel: Model<PatientDocument>,
    @InjectModel(Doctor.name)
    private readonly doctorModel: Model<DoctorDocument>,
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
  ) {}

  record(metric: RequestMetric): void {
    this.metrics.push(metric);
    if (this.metrics.length > 1000) {
      this.metrics.shift();
    }
  }

  getTechnicalMetrics() {
    const total = this.metrics.length;
    const sortedLatencies = this.metrics
      .map((m) => m.latencyMs)
      .sort((a, b) => a - b);
    const p95Index = Math.max(0, Math.ceil(sortedLatencies.length * 0.95) - 1);
    const p95LatencyMs = sortedLatencies[p95Index] ?? 0;
    const errors = this.metrics.filter((m) => m.statusCode >= 500).length;
    const errorRate = total > 0 ? (errors / total) * 100 : 0;

    return {
      sampleSize: total,
      p95LatencyMs,
      errorRate,
      timestamp: new Date().toISOString(),
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
                $cond: [
                  { $eq: ['$doctorStatus', DoctorStatus.PENDING] },
                  1,
                  0,
                ],
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
                $cond: [
                  { $gte: ['$createdAt', sevenDaysAgo] },
                  1,
                  0,
                ],
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
                $cond: [
                  { $gte: ['$createdAt', sevenDaysAgo] },
                  1,
                  0,
                ],
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
