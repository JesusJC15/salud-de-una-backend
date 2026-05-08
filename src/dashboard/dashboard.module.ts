import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiModule } from '../ai/ai.module';
import {
  Consultation,
  ConsultationSchema,
} from '../consultations/schemas/consultation.schema';
import { Doctor, DoctorSchema } from '../doctors/schemas/doctor.schema';
import { Followup, FollowupSchema } from '../followups/schemas/followup.schema';
import {
  Notification,
  NotificationSchema,
} from '../notifications/schemas/notification.schema';
import { Patient, PatientSchema } from '../patients/schemas/patient.schema';
import { REDIS_CLIENT } from '../redis/redis.constants';
import {
  TriageSession,
  TriageSessionSchema,
} from '../triage/schemas/triage-session.schema';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { ErrorLogsService } from './error-logs.service';
import { InMemoryTechnicalMetricsStore } from './metrics/in-memory-technical-metrics.store';
import { RedisTechnicalMetricsStore } from './metrics/redis-technical-metrics.store';
import { TechnicalMetricsService } from './metrics/technical-metrics.service';

@Module({
  imports: [
    AiModule,
    MongooseModule.forFeature([
      { name: Patient.name, schema: PatientSchema },
      { name: Doctor.name, schema: DoctorSchema },
      { name: Notification.name, schema: NotificationSchema },
      { name: Consultation.name, schema: ConsultationSchema },
      { name: TriageSession.name, schema: TriageSessionSchema },
      { name: Followup.name, schema: FollowupSchema },
    ]),
  ],
  controllers: [DashboardController],
  providers: [
    DashboardService,
    InMemoryTechnicalMetricsStore,
    {
      provide: RedisTechnicalMetricsStore,
      inject: [REDIS_CLIENT],
      useFactory: (redisClient: unknown) =>
        new RedisTechnicalMetricsStore(
          redisClient as ConstructorParameters<
            typeof RedisTechnicalMetricsStore
          >[0],
        ),
    },
    TechnicalMetricsService,
    ErrorLogsService,
  ],
  exports: [DashboardService, ErrorLogsService],
})
export class DashboardModule {}
