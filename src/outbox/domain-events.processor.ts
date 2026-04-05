import { Injectable, Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DOMAIN_EVENTS_QUEUE_NAME } from './outbox.constants';
import { DomainEventsHandlerService } from './domain-events-handler.service';
import { OutboxService } from './outbox.service';

@Processor(DOMAIN_EVENTS_QUEUE_NAME)
@Injectable()
export class DomainEventsProcessor extends WorkerHost {
  private readonly logger = new Logger(DomainEventsProcessor.name);

  constructor(
    private readonly domainEventsHandler: DomainEventsHandlerService,
    private readonly outboxService: OutboxService,
  ) {
    super();
  }

  async process(job: Job<{ outboxEventId: string }>): Promise<void> {
    await this.domainEventsHandler.processOutboxEventById(
      job.data.outboxEventId,
    );
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<{ outboxEventId: string }>, error: Error) {
    if (!job) {
      return;
    }

    if ((job.attemptsMade ?? 0) >= (job.opts.attempts ?? 1)) {
      await this.outboxService.reschedule(
        job.data.outboxEventId,
        job.attemptsMade,
        error.message,
      );
    }

    this.logger.warn(
      `BullMQ job ${job.id} failed for outbox event ${job.data.outboxEventId}: ${error.message}`,
    );
  }
}
