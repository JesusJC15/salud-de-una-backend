import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConnectionOptions, Job, Worker } from 'bullmq';
import { REDIS_CONNECTION_OPTIONS } from '../redis/redis.constants';
import { DOMAIN_EVENTS_QUEUE_NAME } from './outbox.constants';
import { DomainEventsHandlerService } from './domain-events-handler.service';
import { OutboxService } from './outbox.service';

@Injectable()
export class DomainEventsProcessor
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(DomainEventsProcessor.name);
  private worker: Worker<{ outboxEventId: string }> | null = null;

  constructor(
    private readonly configService: ConfigService,
    @Inject(REDIS_CONNECTION_OPTIONS)
    private readonly connectionOptions: ConnectionOptions | null,
    private readonly domainEventsHandler: DomainEventsHandlerService,
    private readonly outboxService: OutboxService,
  ) {}

  onApplicationBootstrap(): void {
    const redisUrl = this.configService.get<string>('redis.url');
    if (!redisUrl || !this.connectionOptions) {
      return;
    }

    this.worker = new Worker(
      DOMAIN_EVENTS_QUEUE_NAME,
      async (job) => this.process(job),
      {
        connection: this.connectionOptions,
        prefix: `${this.configService.get<string>('redis.keyPrefix') ?? 'salud-de-una'}:bull`,
      },
    );
    this.worker.on('failed', (job, error) => {
      void this.onFailed(
        job as Job<{ outboxEventId: string }> | undefined,
        error instanceof Error ? error : new Error(String(error)),
      );
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    this.worker = null;
  }

  async process(job: Job<{ outboxEventId: string }>): Promise<void> {
    await this.domainEventsHandler.processOutboxEventById(
      job.data.outboxEventId,
    );
  }

  async onFailed(
    job: Job<{ outboxEventId: string }> | undefined,
    error: Error,
  ) {
    if (!job) {
      return;
    }

    if ((job.attemptsMade ?? 0) >= (job.opts.attempts ?? 1)) {
      await this.outboxService.reschedule(
        job.data.outboxEventId,
        Math.max(job.attemptsMade, 5),
        error.message,
      );
    }

    this.logger.warn(
      `BullMQ job ${job.id} failed for outbox event ${job.data.outboxEventId}: ${error.message}`,
    );
  }
}
