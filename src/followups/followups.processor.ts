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
import { FollowupsService } from './followups.service';
import { FOLLOWUPS_QUEUE_NAME } from './followups.constants';

@Injectable()
export class FollowupsProcessor
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(FollowupsProcessor.name);
  private worker: Worker<{
    followupId: string;
    action: 'due' | 'missed';
  }> | null = null;
  private intervalHandle?: NodeJS.Timeout;

  constructor(
    private readonly configService: ConfigService,
    @Inject(REDIS_CONNECTION_OPTIONS)
    private readonly connectionOptions: ConnectionOptions | null,
    private readonly followupsService: FollowupsService,
  ) {}

  onApplicationBootstrap(): void {
    const redisUrl = this.configService.get<string>('redis.url');
    const isProduction =
      (this.configService.get<string>('NODE_ENV') ?? 'development') ===
      'production';

    if (redisUrl && this.connectionOptions) {
      this.worker = new Worker(
        FOLLOWUPS_QUEUE_NAME,
        async (job) => this.process(job),
        {
          connection: this.connectionOptions,
          prefix: `${this.configService.get<string>('redis.keyPrefix') ?? 'salud-de-una'}:bull`,
        },
      );
      return;
    }

    if (isProduction) {
      throw new Error(
        'FollowupsProcessor requiere Redis en production para scheduling distribuido',
      );
    }

    this.intervalHandle = setInterval(() => {
      void this.followupsService.processDueFollowups();
      void this.followupsService.processMissedFollowups();
    }, 60_000);
    this.logger.warn('Followups queue fallback activo sin Redis');
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
    }
    await this.worker?.close();
  }

  async process(job: Job<{ followupId: string; action: 'due' | 'missed' }>) {
    if (job.data.action === 'due') {
      await this.followupsService.markDue(job.data.followupId);
      return;
    }

    await this.followupsService.markMissed(job.data.followupId);
  }
}
