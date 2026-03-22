import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { type RedisOptions } from 'ioredis';
import { REDIS_CLIENT, REDIS_CONNECTION_OPTIONS } from './redis.constants';
import { RedisHealthService } from './redis-health.service';
import { parseRedisUrl } from './redis-url.util';

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
        return new Redis(redisUrl, clientOptions as RedisOptions);
      },
    },
    RedisHealthService,
  ],
  exports: [REDIS_CLIENT, REDIS_CONNECTION_OPTIONS, RedisHealthService],
})
export class RedisModule {}
