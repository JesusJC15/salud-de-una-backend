import { RedisHealthService } from './redis-health.service';
import { RedisThrottlerStorage } from './redis-throttler.storage';

describe('RedisThrottlerStorage', () => {
  const redisClient = {
    incr: jest.fn(),
    pttl: jest.fn(),
    pexpire: jest.fn(),
    set: jest.fn(),
  };
  const redisHealthService = {
    isAvailable: jest.fn(),
  };

  let storage: RedisThrottlerStorage;

  beforeEach(() => {
    jest.clearAllMocks();
    storage = new RedisThrottlerStorage(
      redisHealthService as unknown as RedisHealthService,
      redisClient as never,
    );
  });

  it('should use Redis when available', async () => {
    redisHealthService.isAvailable.mockResolvedValue(true);
    redisClient.incr.mockResolvedValue(1);
    redisClient.pttl
      .mockResolvedValueOnce(-1)
      .mockResolvedValueOnce(-1)
      .mockResolvedValueOnce(59000);
    redisClient.pexpire.mockResolvedValue(1);

    const result = await storage.increment('key', 60000, 20, 30000, 'default');

    expect(redisClient.incr).toHaveBeenCalled();
    expect(redisClient.pexpire).toHaveBeenCalled();
    expect(result).toMatchObject({
      totalHits: 1,
      isBlocked: false,
    });
  });

  it('should block when limit is exceeded', async () => {
    redisHealthService.isAvailable.mockResolvedValue(true);
    redisClient.incr.mockResolvedValue(21);
    redisClient.pttl
      .mockResolvedValueOnce(59000)
      .mockResolvedValueOnce(-1)
      .mockResolvedValueOnce(59000);
    redisClient.set.mockResolvedValue('OK');

    const result = await storage.increment('key', 60000, 20, 30000, 'default');

    expect(redisClient.set).toHaveBeenCalledWith(
      'throttle:default:key:block',
      '1',
      'PX',
      30000,
    );
    expect(result.isBlocked).toBe(true);
  });

  it('should fall back when Redis is unavailable', async () => {
    redisHealthService.isAvailable.mockResolvedValue(false);

    const result = await storage.increment('key', 60000, 20, 30000, 'default');

    expect(result.totalHits).toBe(1);
    expect(result.isBlocked).toBe(false);
  });
});
