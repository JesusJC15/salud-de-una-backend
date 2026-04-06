import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { DOMAIN_EVENTS_QUEUE } from './outbox.constants';
import { DomainEventsHandlerService } from './domain-events-handler.service';
import { OutboxService } from './outbox.service';

@Injectable()
export class OutboxDispatcherService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private intervalHandle?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly outboxService: OutboxService,
    private readonly domainEventsHandler: DomainEventsHandlerService,
    @Inject(DOMAIN_EVENTS_QUEUE)
    private readonly domainEventsQueue: Queue | null,
  ) {}

  onApplicationBootstrap(): void {
    const intervalMs =
      this.configService.get<number>('redis.outboxDispatchIntervalMs') ?? 1_000;

    this.intervalHandle = setInterval(() => {
      void this.dispatchPendingEvents();
    }, intervalMs);
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
    }

    await this.domainEventsQueue?.close();
  }

  async dispatchPendingEvents(limit = 20): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    try {
      for (let index = 0; index < limit; index += 1) {
        const event = await this.outboxService.claimNextPendingEvent();
        if (!event) {
          break;
        }

        try {
          if (this.domainEventsQueue) {
            await this.domainEventsQueue.add(
              event.eventType,
              { outboxEventId: event.id },
              {
                jobId: event.id,
                attempts: 5,
                backoff: {
                  type: 'exponential',
                  delay: 1_000,
                },
                removeOnComplete: 100,
                removeOnFail: 100,
              },
            );
          } else {
            await this.domainEventsHandler.processOutboxEventById(event.id);
          }
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `Failed to dispatch outbox event ${event.id}: ${message}`,
          );
          await this.outboxService.reschedule(
            event.id,
            event.attempts,
            message,
          );
        }
      }
    } finally {
      this.running = false;
    }
  }
}
