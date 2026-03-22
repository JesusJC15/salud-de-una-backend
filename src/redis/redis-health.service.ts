import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

export type RedisReadiness = {
  status: 'up' | 'down' | 'disabled';
  detail: string;
  latencyMs: number | null;
  degraded: boolean;
};

@Injectable()
export class RedisHealthService {
  private readonly logger = new Logger(RedisHealthService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis | null,
  ) {}

  isEnabled(): boolean {
    return this.redisClient !== null;
  }

  async isAvailable(): Promise<boolean> {
    const status = await this.getReadiness();
    return status.status === 'up';
  }

  async getReadiness(): Promise<RedisReadiness> {
    if (!this.redisClient) {
      return {
        status: 'disabled',
        detail: 'Redis disabled: REDIS_URL not configured',
        latencyMs: null,
        degraded: true,
      };
    }

    const startedAt = Date.now();

    try {
      await this.ensureConnected();
      const pingResult = await this.redisClient.ping();
      const latencyMs = Date.now() - startedAt;

      return {
        status: pingResult === 'PONG' ? 'up' : 'down',
        detail:
          pingResult === 'PONG'
            ? 'Redis connection is healthy'
            : `Unexpected Redis ping response: ${String(pingResult)}`,
        latencyMs,
        degraded: pingResult !== 'PONG',
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Redis health-check failed: ${message}`);
      return {
        status: 'down',
        detail: `Redis unavailable: ${message}`,
        latencyMs: null,
        degraded: true,
      };
    }
  }

  private async ensureConnected(): Promise<void> {
    if (!this.redisClient) {
      return;
    }

    if (
      this.redisClient.status === 'ready' ||
      this.redisClient.status === 'connecting' ||
      this.redisClient.status === 'reconnecting'
    ) {
      return;
    }

    if (this.redisClient.status === 'wait') {
      await this.redisClient.connect();
    }
  }
}
