import { parseRedisUrl } from './redis-url.util';

describe('parseRedisUrl', () => {
  it('should parse secure redis url with credentials and db', () => {
    const result = parseRedisUrl(
      'rediss://user:pass@cache.example.com:6380/2',
      'salud',
    );

    expect(result.connectionOptions).toMatchObject({
      host: 'cache.example.com',
      port: 6380,
      username: 'user',
      password: 'pass',
      db: 2,
      tls: {},
    });
    expect(result.clientOptions).toMatchObject({
      host: 'cache.example.com',
      port: 6380,
      username: 'user',
      password: 'pass',
      db: 2,
      keyPrefix: 'salud:',
      lazyConnect: true,
      enableReadyCheck: true,
      maxRetriesPerRequest: 1,
    });
  });

  it('should fallback defaults for non-tls redis url', () => {
    const result = parseRedisUrl('redis://cache.example.com', 'prefix');

    expect(result.connectionOptions).toMatchObject({
      host: 'cache.example.com',
      port: 6379,
      username: undefined,
      password: undefined,
      db: undefined,
      tls: undefined,
    });
    expect(result.clientOptions.keyPrefix).toBe('prefix:');
  });
});
