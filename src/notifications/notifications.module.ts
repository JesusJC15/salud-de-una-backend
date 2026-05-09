import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { Patient, PatientSchema } from '../patients/schemas/patient.schema';
import {
  Notification,
  NotificationSchema,
} from './schemas/notification.schema';
import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';
import { PushNotificationsService } from './push-notifications.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: Patient.name, schema: PatientSchema },
    ]),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    PushNotificationsService,
    NotificationsGateway,
  ],
  exports: [
    NotificationsService,
    PushNotificationsService,
    NotificationsGateway,
  ],
})
export class NotificationsModule {}
