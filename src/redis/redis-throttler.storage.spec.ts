import { RedisThrottlerStorage } from './redis-throttler.storage';

describe('RedisThrottlerStorage', () => {
  const redisClient = {
    eval: jest.fn(),
    status: 'ready',
  };

  let storage: RedisThrottlerStorage;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    redisClient.status = 'ready';
    storage = new RedisThrottlerStorage(redisClient as never);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('should use Redis when available', async () => {
    redisClient.eval.mockResolvedValue([1, 59000, 0, 0]);

    const result = await storage.increment('key', 60000, 20, 30000, 'default');

    expect(redisClient.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('INCR', hitsKey)"),
      2,
      'throttle:default:key:hits',
      'throttle:default:key:block',
      60000,
      20,
      30000,
    );
    expect(result).toMatchObject({
      totalHits: 1,
      isBlocked: false,
    });
  });

  it('should block when limit is exceeded', async () => {
    redisClient.eval.mockResolvedValue([21, 59000, 1, 30000]);

    const result = await storage.increment('key', 60000, 20, 30000, 'default');

    expect(result.isBlocked).toBe(true);
    expect(result.timeToBlockExpire).toBe(30000);
  });

  it('should fall back when Redis is unavailable', async () => {
    storage = new RedisThrottlerStorage(null);

    const result = await storage.increment('key', 60000, 20, 30000, 'default');

    expect(result.totalHits).toBe(1);
    expect(result.isBlocked).toBe(false);
  });

  it('should fall back when Redis client has ended', async () => {
    redisClient.status = 'end';

    const result = await storage.increment('key', 60000, 20, 30000, 'default');

    expect(redisClient.eval).not.toHaveBeenCalled();
    expect(result.totalHits).toBe(1);
    expect(result.isBlocked).toBe(false);
  });

  it('should fall back when Redis script fails', async () => {
    redisClient.eval.mockRejectedValue(new Error('boom'));

    const result = await storage.increment('key', 60000, 20, 30000, 'default');

    expect(result.totalHits).toBe(1);
    expect(result.isBlocked).toBe(false);
  });
});
