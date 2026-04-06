import { RedisTechnicalMetricsStore } from './redis-technical-metrics.store';

describe('RedisTechnicalMetricsStore', () => {
  let redisClient: {
    multi: jest.Mock;
    lrange: jest.Mock;
    status?: string;
  };

  beforeEach(() => {
    redisClient = {
      multi: jest.fn(),
      lrange: jest.fn(),
      status: 'ready',
    };
  });

  it('record should no-op when redis is disabled', async () => {
    const store = new RedisTechnicalMetricsStore(null);

    await expect(
      store.record({
        statusCode: 200,
        latencyMs: 12,
      }),
    ).resolves.toBeUndefined();
  });

  it('record should push and trim metrics in redis', async () => {
    const exec = jest.fn().mockResolvedValue([]);
    const ltrim = jest.fn().mockReturnValue({ exec });
    const lpush = jest.fn().mockReturnValue({ ltrim });
    const multi = jest.fn().mockReturnValue({ lpush });
    redisClient.multi.mockImplementation(multi);
    const store = new RedisTechnicalMetricsStore(redisClient as never);

    await store.record({
      statusCode: 200,
      latencyMs: 12,
    });

    expect(redisClient.multi).toHaveBeenCalled();
    expect(lpush).toHaveBeenCalled();
    expect(ltrim).toHaveBeenCalledWith('technical-metrics', 0, 999);
    expect(exec).toHaveBeenCalled();
  });

  it('record should throw when redis command fails after client is enabled', async () => {
    const exec = jest.fn().mockRejectedValue(new Error('socket closed'));
    const ltrim = jest.fn().mockReturnValue({ exec });
    const lpush = jest.fn().mockReturnValue({ ltrim });
    redisClient.multi.mockReturnValue({ lpush });
    const store = new RedisTechnicalMetricsStore(redisClient as never);

    await expect(
      store.record({
        statusCode: 200,
        latencyMs: 12,
      }),
    ).rejects.toThrow('socket closed');
  });

  it('getSummary should ignore invalid payloads and build redis snapshot', async () => {
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

    const store = new RedisTechnicalMetricsStore(redisClient as never);

    const summary = await store.getSummary();

    expect(summary).toMatchObject({
      sampleSize: 2,
      p95LatencyMs: 120,
      errorRate: 50,
      source: 'redis',
      degraded: false,
    });
  });

  it('getSummary should throw disabled when redis is not configured', async () => {
    const store = new RedisTechnicalMetricsStore(null);

    await expect(store.getSummary()).rejects.toThrow(
      'Redis metrics store disabled',
    );
  });

  it('getSummary should normalize ended client failures as unavailable', async () => {
    redisClient.status = 'end';
    redisClient.lrange.mockRejectedValue(new Error('Connection is closed.'));
    const store = new RedisTechnicalMetricsStore(redisClient as never);

    await expect(store.getSummary()).rejects.toThrow(
      'Redis metrics store unavailable',
    );
  });
});
