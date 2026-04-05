import { Injectable, Logger } from '@nestjs/common';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import Redis from 'ioredis';
import { RedisHealthService } from './redis-health.service';

type ThrottlerStorageRecord = {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
};
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly fallbackStorage = new ThrottlerStorageService();

  constructor(
    private readonly redisHealthService: RedisHealthService,
    private readonly redisClient: Redis | null,
  ) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    if (!this.redisClient || !(await this.redisHealthService.isAvailable())) {
      return this.fallbackStorage.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );
    }

    const hitsKey = `throttle:${throttlerName}:${key}:hits`;
    const blockKey = `throttle:${throttlerName}:${key}:block`;

    try {
      const totalHits = await this.redisClient.incr(hitsKey);
      const currentTtl = await this.redisClient.pttl(hitsKey);

      if (currentTtl < 0) {
        await this.redisClient.pexpire(hitsKey, ttl);
      }

      let isBlocked = false;
      let timeToBlockExpire = await this.redisClient.pttl(blockKey);

      if (timeToBlockExpire > 0) {
        isBlocked = true;
      } else if (totalHits > limit) {
        await this.redisClient.set(blockKey, '1', 'PX', blockDuration);
        isBlocked = true;
        timeToBlockExpire = blockDuration;
      } else {
        timeToBlockExpire = 0;
      }

      const timeToExpire = await this.redisClient.pttl(hitsKey);

      return {
        totalHits,
        timeToExpire: Math.max(timeToExpire, 0),
        isBlocked,
        timeToBlockExpire: Math.max(timeToBlockExpire, 0),
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Redis throttler fallback to memory: ${message}`);
      return this.fallbackStorage.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );
    }
  }
}
