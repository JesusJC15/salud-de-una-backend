import type { ConnectionOptions } from 'bullmq';
import type { RedisOptions } from 'ioredis';

type ParsedRedisOptions = {
  clientOptions: RedisOptions;
  connectionOptions: ConnectionOptions;
};

function shouldStopRetrying(error: Error): boolean {
  return error.message.includes('ERR max number of clients reached');
}

export function parseRedisUrl(
  redisUrl: string,
  keyPrefix: string,
): ParsedRedisOptions {
  const parsedUrl = new URL(redisUrl);
  const port = parsedUrl.port ? Number(parsedUrl.port) : 6379;
  const db = /^\/\d+$/.test(parsedUrl.pathname)
    ? Number(parsedUrl.pathname.slice(1))
    : undefined;
  const tls = parsedUrl.protocol === 'rediss:' ? {} : undefined;
  const baseConnection: ConnectionOptions = {
    host: parsedUrl.hostname,
    port,
    username: parsedUrl.username || undefined,
    password: parsedUrl.password || undefined,
    db: Number.isInteger(db) ? db : undefined,
    tls,
  };

  return {
    clientOptions: {
      lazyConnect: true,
      keyPrefix: `${keyPrefix}:`,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      enableOfflineQueue: false,
      retryStrategy: (times: number) => Math.min(times * 250, 2_000),
      reconnectOnError: (error: Error) => !shouldStopRetrying(error),
      ...baseConnection,
    },
    connectionOptions: {
      ...baseConnection,
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
      retryStrategy: (times: number) => Math.min(times * 250, 2_000),
      reconnectOnError: (error: Error) => !shouldStopRetrying(error),
    },
  };
}
