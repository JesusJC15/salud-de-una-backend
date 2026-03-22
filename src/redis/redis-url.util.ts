import type { ConnectionOptions } from 'bullmq';

type ParsedRedisOptions = {
  clientOptions: Record<string, unknown>;
  connectionOptions: ConnectionOptions;
};

export function parseRedisUrl(
  redisUrl: string,
  keyPrefix: string,
): ParsedRedisOptions {
  const parsedUrl = new URL(redisUrl);
  const port = parsedUrl.port ? Number(parsedUrl.port) : 6379;
  const db = parsedUrl.pathname
    ? Number(parsedUrl.pathname.replace('/', ''))
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
      ...baseConnection,
    },
    connectionOptions: baseConnection,
  };
}
