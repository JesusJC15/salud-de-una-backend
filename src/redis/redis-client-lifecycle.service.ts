import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
} from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

@Injectable()
export class RedisClientLifecycleService implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisClientLifecycleService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redisClient: Redis | null) {}

  async onApplicationShutdown(): Promise<void> {
    if (
      !this.redisClient ||
      this.redisClient.status === 'end' ||
      this.redisClient.status === 'wait'
    ) {
      return;
    }

    try {
      await this.redisClient.quit();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to quit Redis client gracefully: ${message}`);
      this.redisClient.disconnect();
    }
  }
}
