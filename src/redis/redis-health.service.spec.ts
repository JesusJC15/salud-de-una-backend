import { RedisHealthService } from './redis-health.service';

describe('RedisHealthService', () => {
  it('should report disabled when redis client is not configured', async () => {
    const service = new RedisHealthService(null);

    await expect(service.isAvailable()).resolves.toBe(false);
    await expect(service.getReadiness()).resolves.toMatchObject({
      status: 'disabled',
      degraded: true,
      latencyMs: null,
    });
  });

  it('should report up when ping returns PONG', async () => {
    const redisClient = {
      status: 'ready',
      ping: jest.fn().mockResolvedValue('PONG'),
    };
    const service = new RedisHealthService(redisClient as never);

    const result = await service.getReadiness();

    expect(result).toMatchObject({
      status: 'up',
      degraded: false,
    });
    expect(redisClient.ping).toHaveBeenCalled();
  });

  it('should connect when client is in wait status', async () => {
    const redisClient = {
      status: 'wait',
      connect: jest.fn().mockResolvedValue(undefined),
      ping: jest.fn().mockResolvedValue('PONG'),
    };
    const service = new RedisHealthService(redisClient as never);

    await service.getReadiness();

    expect(redisClient.connect).toHaveBeenCalled();
  });

  it('should report down on unexpected ping response', async () => {
    const redisClient = {
      status: 'ready',
      ping: jest.fn().mockResolvedValue('NOPE'),
    };
    const service = new RedisHealthService(redisClient as never);

    await expect(service.getReadiness()).resolves.toMatchObject({
      status: 'down',
      degraded: true,
    });
  });

  it('should report down when ping throws', async () => {
    const redisClient = {
      status: 'ready',
      ping: jest.fn().mockRejectedValue(new Error('unreachable')),
    };
    const service = new RedisHealthService(redisClient as never);

    await expect(service.getReadiness()).resolves.toMatchObject({
      status: 'down',
      degraded: true,
      detail: 'Redis unavailable: unreachable',
    });
  });
});
