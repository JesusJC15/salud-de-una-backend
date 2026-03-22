import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Doctor, DoctorSchema } from '../doctors/schemas/doctor.schema';
import {
  Notification,
  NotificationSchema,
} from '../notifications/schemas/notification.schema';
import { Patient, PatientSchema } from '../patients/schemas/patient.schema';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { RedisHealthService } from '../redis/redis-health.service';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { InMemoryTechnicalMetricsStore } from './metrics/in-memory-technical-metrics.store';
import { RedisTechnicalMetricsStore } from './metrics/redis-technical-metrics.store';
import { TechnicalMetricsService } from './metrics/technical-metrics.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Patient.name, schema: PatientSchema },
      { name: Doctor.name, schema: DoctorSchema },
      { name: Notification.name, schema: NotificationSchema },
    ]),
  ],
  controllers: [DashboardController],
  providers: [
    DashboardService,
    InMemoryTechnicalMetricsStore,
    {
      provide: RedisTechnicalMetricsStore,
      inject: [RedisHealthService, REDIS_CLIENT],
      useFactory: (
        redisHealthService: RedisHealthService,
        redisClient: unknown,
      ) =>
        new RedisTechnicalMetricsStore(
          redisHealthService,
          redisClient as ConstructorParameters<
            typeof RedisTechnicalMetricsStore
          >[1],
        ),
    },
    TechnicalMetricsService,
  ],
  exports: [DashboardService],
})
export class DashboardModule {}
