import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { RequestUser } from '../common/interfaces/request-user.interface';
import { PushNotificationsService } from './push-notifications.service';
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
    private readonly pushNotificationsService: PushNotificationsService,
  ) {}

  async createDoctorStatusChange(
    userId: string,
    doctorStatus: string,
    notes?: string,
    session?: ClientSession,
    options?: { sourceEventId?: string },
  ): Promise<void> {
    try {
      await this.notificationModel.create(
        [
          {
            userId: new Types.ObjectId(userId),
            type: 'DOCTOR_STATUS_CHANGE',
            status: doctorStatus,
            message: notes
              ? `Tu verificacion como doctor fue ${doctorStatus}. Notas: ${notes}`
              : `Tu verificacion como doctor fue ${doctorStatus}.`,
            sourceEventId: options?.sourceEventId,
            read: false,
          },
        ],
        session ? { session } : undefined,
      );
      this.logger.log(`Notificacion creada para ${userId}`);
    } catch (error: unknown) {
      if (this.isDuplicateSourceEvent(error)) {
        this.logger.warn(
          `Notificacion duplicada ignorada para sourceEventId=${options?.sourceEventId}`,
        );
        return;
      }

      throw error;
    }
  }

  async createUserNotification(input: {
    userId: string;
    type: string;
    status: string;
    message: string;
    session?: ClientSession;
    sourceEventId?: string;
    resourceId?: string;
    deepLink?: string;
    metadata?: Record<string, unknown>;
    push?: {
      title: string;
      body: string;
      data?: Record<string, unknown>;
    };
  }): Promise<void> {
    try {
      await this.notificationModel.create(
        [
          {
            userId: new Types.ObjectId(input.userId),
            type: input.type,
            status: input.status,
            message: input.message,
            sourceEventId: input.sourceEventId,
            resourceId: input.resourceId,
            deepLink: input.deepLink,
            metadata: input.metadata,
            read: false,
          },
        ],
        input.session ? { session: input.session } : undefined,
      );
    } catch (error: unknown) {
      if (this.isDuplicateSourceEvent(error)) {
        this.logger.warn(
          `Notificacion duplicada ignorada para sourceEventId=${input.sourceEventId}`,
        );
        return;
      }

      throw error;
    }

    if (input.push) {
      await this.pushNotificationsService.sendToUser({
        userId: input.userId,
        title: input.push.title,
        body: input.push.body,
        data: input.push.data,
      });
    }
  }

  async getMine(user: RequestUser, unreadOnly = false, limit = 20) {
    const sanitizedLimit = Math.min(Math.max(limit, 1), 100);
    const query = {
      userId: new Types.ObjectId(user.userId),
      ...(unreadOnly ? { read: false } : {}),
    };

    const [items, unreadCount] = await Promise.all([
      this.notificationModel
        .find(query)
        .sort({ createdAt: -1 })
        .limit(sanitizedLimit)
        .lean()
        .exec(),
      this.notificationModel
        .countDocuments({
          userId: new Types.ObjectId(user.userId),
          read: false,
        })
        .exec(),
    ]);

    return {
      items: items.map((notification) => ({
        id: notification._id.toString(),
        type: notification.type,
        status: notification.status,
        message: notification.message,
        resourceId: notification.resourceId,
        deepLink: notification.deepLink,
        metadata: notification.metadata ?? null,
        read: notification.read,
        readAt: notification.readAt ?? null,
        createdAt: notification.createdAt ?? null,
      })),
      unreadCount,
    };
  }

  async markAsRead(notificationId: string, user: RequestUser) {
    if (!Types.ObjectId.isValid(notificationId)) {
      throw new NotFoundException('Notificacion no encontrada');
    }

    const notification = await this.notificationModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(notificationId),
          userId: new Types.ObjectId(user.userId),
        },
        {
          $set: {
            read: true,
            readAt: new Date(),
          },
        },
        { returnDocument: 'after' },
      )
      .lean()
      .exec();

    if (!notification) {
      throw new NotFoundException('Notificacion no encontrada');
    }

    return {
      id: notification._id.toString(),
      read: notification.read,
      readAt: notification.readAt ?? null,
    };
  }

  async markAllAsRead(user: RequestUser) {
    const now = new Date();
    const result = await this.notificationModel
      .updateMany(
        {
          userId: new Types.ObjectId(user.userId),
          read: false,
        },
        {
          $set: {
            read: true,
            readAt: now,
          },
        },
      )
      .exec();

    return {
      updatedCount: result.modifiedCount,
      readAt: now,
    };
  }

  private isDuplicateSourceEvent(error: unknown): boolean {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as Record<string, unknown>).code === 11000
    ) {
      const keyPattern = (error as Record<string, unknown>).keyPattern;
      return (
        typeof keyPattern === 'object' &&
        keyPattern !== null &&
        'sourceEventId' in (keyPattern as Record<string, unknown>)
      );
    }

    return false;
  }
}
