import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { MongooseModule } from '@nestjs/mongoose';
import { ConnectionOptions, Queue } from 'bullmq';
import {
  Consultation,
  ConsultationSchema,
} from '../consultations/schemas/consultation.schema';
import { Doctor, DoctorSchema } from '../doctors/schemas/doctor.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { Patient, PatientSchema } from '../patients/schemas/patient.schema';
import { REDIS_CONNECTION_OPTIONS } from '../redis/redis.constants';
import {
  TriageSession,
  TriageSessionSchema,
} from '../triage/schemas/triage-session.schema';
import { FollowupsController } from './followups.controller';
import { FOLLOWUPS_QUEUE, FOLLOWUPS_QUEUE_NAME } from './followups.constants';
import { FollowupsProcessor } from './followups.processor';
import { FollowupsService } from './followups.service';
import { Followup, FollowupSchema } from './schemas/followup.schema';

@Module({
  imports: [
    BullModule,
    NotificationsModule,
    MongooseModule.forFeature([
      { name: Followup.name, schema: FollowupSchema },
      { name: Consultation.name, schema: ConsultationSchema },
      { name: Doctor.name, schema: DoctorSchema },
      { name: Patient.name, schema: PatientSchema },
      { name: TriageSession.name, schema: TriageSessionSchema },
    ]),
  ],
  controllers: [FollowupsController],
  providers: [
    {
      provide: FOLLOWUPS_QUEUE,
      useFactory: (
        configService: ConfigService,
        connectionOptions: ConnectionOptions | null,
      ): Queue | null => {
        const redisUrl = configService.get<string>('redis.url');
        if (!redisUrl || !connectionOptions) {
          return null;
        }

        return new Queue(FOLLOWUPS_QUEUE_NAME, {
          connection: connectionOptions,
          prefix: `${configService.get<string>('redis.keyPrefix') ?? 'salud-de-una'}:bull`,
        });
      },
      inject: [ConfigService, REDIS_CONNECTION_OPTIONS],
    },
    FollowupsService,
    FollowupsProcessor,
  ],
  exports: [FollowupsService],
})
export class FollowupsModule {}
