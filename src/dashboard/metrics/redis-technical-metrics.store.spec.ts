import { RedisHealthService } from '../../redis/redis-health.service';
import { RedisTechnicalMetricsStore } from './redis-technical-metrics.store';

describe('RedisTechnicalMetricsStore', () => {
  let redisHealthService: { isAvailable: jest.Mock };
  let redisClient: {
    multi: jest.Mock;
    lrange: jest.Mock;
  };

  beforeEach(() => {
    redisHealthService = {
      isAvailable: jest.fn(),
    };
    redisClient = {
      multi: jest.fn(),
      lrange: jest.fn(),
    };
  });

  it('record should throw when redis is unavailable', async () => {
    redisHealthService.isAvailable.mockResolvedValue(false);
    const store = new RedisTechnicalMetricsStore(
      redisHealthService as unknown as RedisHealthService,
      redisClient as never,
    );

    await expect(
      store.record({
        statusCode: 200,
        latencyMs: 12,
      }),
    ).rejects.toThrow('Redis metrics store unavailable');
  });

  it('record should push and trim metrics in redis', async () => {
    const exec = jest.fn().mockResolvedValue([]);
    const ltrim = jest.fn().mockReturnValue({ exec });
    const lpush = jest.fn().mockReturnValue({ ltrim });
    const multi = jest.fn().mockReturnValue({ lpush });
    redisHealthService.isAvailable.mockResolvedValue(true);
    redisClient.multi.mockImplementation(multi);

    const store = new RedisTechnicalMetricsStore(
      redisHealthService as unknown as RedisHealthService,
      redisClient as never,
    );

    await store.record({
      statusCode: 200,
      latencyMs: 12,
    });

    expect(redisClient.multi).toHaveBeenCalled();
    expect(lpush).toHaveBeenCalled();
    expect(ltrim).toHaveBeenCalledWith('technical-metrics', 0, 999);
    expect(exec).toHaveBeenCalled();
  });

  it('getSummary should ignore invalid payloads and build redis snapshot', async () => {
    redisHealthService.isAvailable.mockResolvedValue(true);
    redisClient.lrange.mockResolvedValue([
      JSON.stringify({
        statusCode: 200,
        latencyMs: 20,
      }),
      'invalid-json',
      JSON.stringify({
        statusCode: 503,
        latencyMs: 120,
      }),
    ]);

    const store = new RedisTechnicalMetricsStore(
      redisHealthService as unknown as RedisHealthService,
      redisClient as never,
    );

    const summary = await store.getSummary();

    expect(summary).toMatchObject({
      sampleSize: 2,
      p95LatencyMs: 120,
      errorRate: 50,
      source: 'redis',
      degraded: false,
    });
  });
});
