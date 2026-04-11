import { Injectable, Logger } from '@nestjs/common';
import { DoctorStatus } from '../common/enums/doctor-status.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { DOCTOR_VERIFICATION_CHANGED_EVENT } from './outbox.constants';
import { OutboxService } from './outbox.service';

@Injectable()
export class DomainEventsHandlerService {
  private readonly logger = new Logger(DomainEventsHandlerService.name);

  constructor(
    private readonly outboxService: OutboxService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async processOutboxEventById(eventId: string): Promise<void> {
    const event = await this.outboxService.findById(eventId);
    if (!event) {
      return;
    }

    const payload = event.payload as {
      doctorId?: string;
      doctorStatus?: DoctorStatus;
      notes?: string;
    };

    if (event.eventType !== DOCTOR_VERIFICATION_CHANGED_EVENT) {
      const message = `Unhandled outbox event type: ${event.eventType}`;
      this.logger.warn(`Outbox event ${event.id} failed: ${message}`);
      throw new Error(message);
    }

    if (!payload.doctorId || !payload.doctorStatus) {
      const message = `Invalid payload for outbox event ${event.id}`;
      this.logger.warn(`Outbox event ${event.id} failed: ${message}`);
      throw new Error(message);
    }

    await this.notificationsService.createDoctorStatusChange(
      payload.doctorId,
      payload.doctorStatus,
      payload.notes,
      undefined,
      { sourceEventId: event.id },
    );

    await this.outboxService.markProcessed(event.id);
  }
}
