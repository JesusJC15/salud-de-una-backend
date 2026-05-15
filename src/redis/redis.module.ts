import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT, REDIS_CONNECTION_OPTIONS } from './redis.constants';
import { RedisClientLifecycleService } from './redis-client-lifecycle.service';
import { RedisHealthService } from './redis-health.service';
import { parseRedisUrl } from './redis-url.util';

const redisLogger = new Logger('RedisModule');

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CONNECTION_OPTIONS,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('redis.url');
        const keyPrefix =
          configService.get<string>('redis.keyPrefix') ?? 'salud-de-una';

        if (!redisUrl) {
          return null;
        }

        return parseRedisUrl(redisUrl, keyPrefix).connectionOptions;
      },
    },
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('redis.url');
        const keyPrefix =
          configService.get<string>('redis.keyPrefix') ?? 'salud-de-una';

        if (!redisUrl) {
          return null;
        }

        const { clientOptions } = parseRedisUrl(redisUrl, keyPrefix);
        const client = new Redis(redisUrl, clientOptions);
        client.on('error', (error: Error) => {
          redisLogger.warn(`Redis client error: ${error.message}`);
        });
        return client;
      },
    },
    RedisClientLifecycleService,
    RedisHealthService,
  ],
  exports: [
    REDIS_CLIENT,
    REDIS_CONNECTION_OPTIONS,
    RedisClientLifecycleService,
    RedisHealthService,
  ],
})
export class RedisModule {}
