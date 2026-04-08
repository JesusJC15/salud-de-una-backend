import { Logger } from '@nestjs/common';
import { RedisClientLifecycleService } from './redis-client-lifecycle.service';

describe('RedisClientLifecycleService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should do nothing when redis client is null', async () => {
    const service = new RedisClientLifecycleService(null);

    await expect(service.onApplicationShutdown()).resolves.toBeUndefined();
  });

  it('should do nothing when redis client has not connected yet', async () => {
    const redisClient = {
      status: 'wait',
      quit: jest.fn(),
      disconnect: jest.fn(),
    };
    const service = new RedisClientLifecycleService(redisClient as never);

    await service.onApplicationShutdown();

    expect(redisClient.quit).not.toHaveBeenCalled();
    expect(redisClient.disconnect).not.toHaveBeenCalled();
  });

  it('should quit redis client gracefully when connected', async () => {
    const redisClient = {
      status: 'ready',
      quit: jest.fn().mockResolvedValue('OK'),
      disconnect: jest.fn(),
    };
    const service = new RedisClientLifecycleService(redisClient as never);

    await service.onApplicationShutdown();

    expect(redisClient.quit).toHaveBeenCalled();
    expect(redisClient.disconnect).not.toHaveBeenCalled();
  });

  it('should disconnect redis client if graceful quit fails', async () => {
    const redisClient = {
      status: 'ready',
      quit: jest.fn().mockRejectedValue(new Error('socket closed')),
      disconnect: jest.fn(),
    };
    const loggerSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const service = new RedisClientLifecycleService(redisClient as never);

    await service.onApplicationShutdown();

    expect(redisClient.quit).toHaveBeenCalled();
    expect(redisClient.disconnect).toHaveBeenCalled();
    expect(loggerSpy).toHaveBeenCalledWith(
      'Failed to quit Redis client gracefully: socket closed',
    );
  });
});
