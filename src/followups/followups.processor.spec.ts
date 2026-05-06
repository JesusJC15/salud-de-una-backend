import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Job, Worker } from 'bullmq';
import { REDIS_CONNECTION_OPTIONS } from '../redis/redis.constants';
import { FOLLOWUPS_QUEUE_NAME } from './followups.constants';
import { FollowupsProcessor } from './followups.processor';
import { FollowupsService } from './followups.service';

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(function MockWorker() {
    return {
      close: jest.fn().mockResolvedValue(undefined),
    };
  }),
}));

describe('FollowupsProcessor', () => {
  let processor: FollowupsProcessor;
  let configService: Pick<ConfigService, 'get'> & {
    get: jest.MockedFunction<ConfigService['get']>;
  };
  let followupsService: {
    processDueFollowups: jest.Mock;
    processMissedFollowups: jest.Mock;
    markDue: jest.Mock;
    markMissed: jest.Mock;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    configService = {
      get: jest.fn<
        ReturnType<ConfigService['get']>,
        Parameters<ConfigService['get']>
      >(),
    };
    followupsService = {
      processDueFollowups: jest.fn(),
      processMissedFollowups: jest.fn(),
      markDue: jest.fn(),
      markMissed: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FollowupsProcessor,
        { provide: ConfigService, useValue: configService },
        { provide: REDIS_CONNECTION_OPTIONS, useValue: null },
        { provide: FollowupsService, useValue: followupsService },
      ],
    }).compile();

    processor = module.get<FollowupsProcessor>(FollowupsProcessor);
  });

  afterEach(async () => {
    await processor.onApplicationShutdown();
    jest.restoreAllMocks();
  });

  it('starts a BullMQ worker when Redis is configured', () => {
    const connectionOptions = { host: 'localhost', port: 6379 };
    configService.get.mockImplementation((key: string) => {
      if (key === 'redis.url') {
        return 'redis://localhost:6379';
      }
      if (key === 'redis.keyPrefix') {
        return 'custom-prefix';
      }
      return undefined;
    });

    processor = new FollowupsProcessor(
      configService as ConfigService,
      connectionOptions,
      followupsService as unknown as FollowupsService,
    );

    processor.onApplicationBootstrap();

    expect(Worker).toHaveBeenCalledWith(
      FOLLOWUPS_QUEUE_NAME,
      expect.any(Function),
      expect.objectContaining({
        connection: connectionOptions,
        prefix: 'custom-prefix:bull',
      }),
    );
  });

  it('falls back to polling when Redis is unavailable', () => {
    const setIntervalSpy = jest
      .spyOn(global, 'setInterval')
      .mockImplementation((handler: TimerHandler) => {
        if (typeof handler === 'function') {
          (handler as () => void)();
        }
        return 123 as unknown as NodeJS.Timeout;
      });

    processor.onApplicationBootstrap();

    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60_000);
    expect(followupsService.processDueFollowups).toHaveBeenCalled();
    expect(followupsService.processMissedFollowups).toHaveBeenCalled();
  });

  it('clears fallback polling on shutdown', async () => {
    const setIntervalSpy = jest
      .spyOn(global, 'setInterval')
      .mockReturnValue(321 as unknown as NodeJS.Timeout);
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

    processor.onApplicationBootstrap();
    await processor.onApplicationShutdown();

    expect(setIntervalSpy).toHaveBeenCalled();
    expect(clearIntervalSpy).toHaveBeenCalledWith(321);
  });

  it('closes the worker on shutdown when one exists', async () => {
    const close = jest.fn().mockResolvedValue(undefined);
    const workerMock = Worker as unknown as jest.Mock;
    workerMock.mockImplementationOnce(() => ({ close }));
    configService.get.mockImplementation((key: string) => {
      if (key === 'redis.url') {
        return 'redis://localhost:6379';
      }
      return undefined;
    });

    processor = new FollowupsProcessor(
      configService as ConfigService,
      { host: 'localhost', port: 6379 },
      followupsService as unknown as FollowupsService,
    );
    processor.onApplicationBootstrap();
    await processor.onApplicationShutdown();

    expect(close).toHaveBeenCalled();
  });

  it('process routes due jobs to markDue', async () => {
    await processor.process({
      data: { followupId: 'f1', action: 'due' },
    } as Job<{ followupId: string; action: 'due' | 'missed' }>);

    expect(followupsService.markDue).toHaveBeenCalledWith('f1');
    expect(followupsService.markMissed).not.toHaveBeenCalled();
  });

  it('process routes missed jobs to markMissed', async () => {
    await processor.process({
      data: { followupId: 'f2', action: 'missed' },
    } as Job<{ followupId: string; action: 'due' | 'missed' }>);

    expect(followupsService.markMissed).toHaveBeenCalledWith('f2');
  });
});
