import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import {
  Notification,
  NotificationDocument,
} from './schemas/notification.schema';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
  ) {}

  async createDoctorStatusChange(
    userId: string,
    doctorStatus: string,
    notes?: string,
    session?: ClientSession,
  ): Promise<void> {
    await this.notificationModel.create(
      [
        {
          userId: new Types.ObjectId(userId),
          type: 'DOCTOR_STATUS_CHANGE',
          status: doctorStatus,
          message: notes
            ? `Tu verificacion como doctor fue ${doctorStatus}. Notas: ${notes}`
            : `Tu verificacion como doctor fue ${doctorStatus}.`,
          read: false,
        },
      ],
      { session },
    );
    this.logger.log(`Notificacion creada para ${userId}`);
  }
}
