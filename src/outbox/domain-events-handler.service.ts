import { Injectable, Logger } from '@nestjs/common';
import { FollowupsService } from '../followups/followups.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CONSULTATION_CLOSED_EVENT,
  DOCTOR_VERIFICATION_CHANGED_EVENT,
} from './outbox.constants';
import {
  ConsultationClosedPayload,
  DoctorVerificationChangedPayload,
  OutboxService,
} from './outbox.service';

@Injectable()
export class DomainEventsHandlerService {
  private readonly logger = new Logger(DomainEventsHandlerService.name);

  constructor(
    private readonly outboxService: OutboxService,
    private readonly notificationsService: NotificationsService,
    private readonly followupsService: FollowupsService,
  ) {}

  async processOutboxEventById(eventId: string): Promise<void> {
    const event = await this.outboxService.findById(eventId);
    if (!event) {
      return;
    }

    const payload = event.payload as
      | DoctorVerificationChangedPayload
      | ConsultationClosedPayload;

    if (event.eventType === DOCTOR_VERIFICATION_CHANGED_EVENT) {
      const doctorPayload = payload as DoctorVerificationChangedPayload;
      if (!doctorPayload.doctorId || !doctorPayload.doctorStatus) {
        const message = `Invalid payload for outbox event ${event.id}`;
        this.logger.warn(`Outbox event ${event.id} failed: ${message}`);
        throw new Error(message);
      }

      await this.notificationsService.createDoctorStatusChange(
        doctorPayload.doctorId,
        doctorPayload.doctorStatus,
        doctorPayload.notes,
        undefined,
        { sourceEventId: event.id },
      );
      await this.outboxService.markProcessed(event.id);
      return;
    }

    if (event.eventType === CONSULTATION_CLOSED_EVENT) {
      const consultationPayload = payload as ConsultationClosedPayload;
      const consultationId = consultationPayload.consultationId;
      if (typeof consultationId !== 'string' || consultationId.length === 0) {
        const message = `Invalid payload for outbox event ${event.id}`;
        this.logger.warn(`Outbox event ${event.id} failed: ${message}`);
        throw new Error(message);
      }

      await this.followupsService.handleConsultationClosedEvent(consultationId);
      await this.outboxService.markProcessed(event.id);
      return;
    }

    const message = `Unhandled outbox event type: ${event.eventType}`;
    this.logger.warn(`Outbox event ${event.id} failed: ${message}`);
    throw new Error(message);
  }
}
