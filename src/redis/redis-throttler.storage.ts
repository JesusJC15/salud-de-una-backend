import { Injectable, Logger } from '@nestjs/common';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import Redis from 'ioredis';

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
  private static readonly INCREMENT_SCRIPT = `
    local hitsKey = KEYS[1]
    local blockKey = KEYS[2]
    local ttl = tonumber(ARGV[1])
    local limit = tonumber(ARGV[2])
    local blockDuration = tonumber(ARGV[3])

    local totalHits = redis.call('INCR', hitsKey)
    local currentTtl = redis.call('PTTL', hitsKey)

    if currentTtl < 0 then
      redis.call('PEXPIRE', hitsKey, ttl)
    end

    local timeToBlockExpire = redis.call('PTTL', blockKey)
    local isBlocked = 0

    if timeToBlockExpire > 0 then
      isBlocked = 1
    elseif totalHits > limit then
      redis.call('SET', blockKey, '1', 'PX', blockDuration)
      isBlocked = 1
      timeToBlockExpire = blockDuration
    else
      timeToBlockExpire = 0
    end

    local timeToExpire = redis.call('PTTL', hitsKey)

    if timeToExpire < 0 then
      timeToExpire = 0
    end

    if timeToBlockExpire < 0 then
      timeToBlockExpire = 0
    end

    return { totalHits, timeToExpire, isBlocked, timeToBlockExpire }
  `;

  constructor(private readonly redisClient: Redis | null) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    if (!this.redisClient || this.redisClient.status === 'end') {
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
      const [totalHits, timeToExpire, isBlockedFlag, timeToBlockExpire] =
        (await this.redisClient.eval(
          RedisThrottlerStorage.INCREMENT_SCRIPT,
          2,
          hitsKey,
          blockKey,
          ttl,
          limit,
          blockDuration,
        )) as [number, number, number, number];

      return {
        totalHits,
        timeToExpire: Math.max(timeToExpire, 0),
        isBlocked: isBlockedFlag === 1,
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
