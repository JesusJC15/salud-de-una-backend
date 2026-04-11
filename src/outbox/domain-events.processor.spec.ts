jest.mock('bullmq', () => {
  class WorkerMock {
    static instances: WorkerMock[] = [];
    public readonly on = jest.fn();
    public readonly close = jest.fn().mockResolvedValue(undefined);

    constructor(
      public readonly name: string,
      public readonly processor: unknown,
      public readonly options: unknown,
    ) {
      WorkerMock.instances.push(this);
    }
  }

  return {
    Worker: WorkerMock,
  };
});

import type { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainEventsProcessor } from './domain-events.processor';

describe('DomainEventsProcessor', () => {
  let configService: { get: jest.Mock };
  let domainEventsHandler: { processOutboxEventById: jest.Mock };
  let outboxService: { reschedule: jest.Mock };
  let processor: DomainEventsProcessor;
  let WorkerMock: {
    instances: Array<{
      on: jest.Mock;
      close: jest.Mock;
      name: string;
      options: unknown;
    }>;
  };

  beforeEach(() => {
    WorkerMock = jest.requireMock('bullmq').Worker as typeof WorkerMock;
    WorkerMock.instances.length = 0;
    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'redis.url') {
          return undefined;
        }
        if (key === 'redis.keyPrefix') {
          return 'salud-de-una';
        }
        return undefined;
      }),
    };
    domainEventsHandler = {
      processOutboxEventById: jest.fn().mockResolvedValue(undefined),
    };
    outboxService = {
      reschedule: jest.fn().mockResolvedValue(undefined),
    };
    processor = new DomainEventsProcessor(
      configService as unknown as ConfigService,
      null,
      domainEventsHandler as never,
      outboxService as never,
    );
  });

  it('should delegate job processing to handler', async () => {
    await processor.process({
      data: { outboxEventId: 'event-1' },
    } as Job<{ outboxEventId: string }>);

    expect(domainEventsHandler.processOutboxEventById).toHaveBeenCalledWith(
      'event-1',
    );
  });

  it('should not start worker when redis is disabled', () => {
    processor.onApplicationBootstrap();

    expect(WorkerMock.instances).toHaveLength(0);
  });

  it('should start worker when redis is configured and close it on shutdown', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'redis.url') {
        return 'redis://localhost:6379';
      }
      if (key === 'redis.keyPrefix') {
        return 'salud-de-una';
      }
      return undefined;
    });
    processor = new DomainEventsProcessor(
      configService as unknown as ConfigService,
      { host: 'localhost', port: 6379 } as never,
      domainEventsHandler as never,
      outboxService as never,
    );

    processor.onApplicationBootstrap();

    expect(WorkerMock.instances).toHaveLength(1);
    expect(WorkerMock.instances[0].name).toBe('domain-events');
    expect(WorkerMock.instances[0].options).toMatchObject({
      connection: { host: 'localhost', port: 6379 },
      prefix: 'salud-de-una:bull',
    });
    expect(WorkerMock.instances[0].on).toHaveBeenCalledWith(
      'failed',
      expect.any(Function),
    );

    await processor.onApplicationShutdown();
    expect(WorkerMock.instances[0].close).toHaveBeenCalled();
  });

  it('should reschedule after final failed attempt', async () => {
    await processor.onFailed(
      {
        id: 'job-1',
        data: { outboxEventId: 'event-2' },
        attemptsMade: 5,
        opts: { attempts: 5 },
      } as Job<{ outboxEventId: string }>,
      new Error('boom'),
    );

    expect(outboxService.reschedule).toHaveBeenCalledWith('event-2', 5, 'boom');
  });

  it('should not reschedule when retry attempts are still available', async () => {
    await processor.onFailed(
      {
        id: 'job-2',
        data: { outboxEventId: 'event-3' },
        attemptsMade: 1,
        opts: { attempts: 5 },
      } as Job<{ outboxEventId: string }>,
      new Error('temporary failure'),
    );

    expect(outboxService.reschedule).not.toHaveBeenCalled();
  });

  it('should log failed jobs regardless of retry count', async () => {
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    await processor.onFailed(
      {
        id: 'job-3',
        data: { outboxEventId: 'event-4' },
        attemptsMade: 0,
        opts: { attempts: 5 },
      } as Job<{ outboxEventId: string }>,
      new Error('failed once'),
    );

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('event-4'),
    );
    warnSpy.mockRestore();
  });

  it('should reschedule using attemptsMade when job options are missing', async () => {
    await processor.onFailed(
      {
        id: 'job-4',
        data: { outboxEventId: 'event-5' },
        attemptsMade: 1,
        opts: {},
      } as Job<{ outboxEventId: string }>,
      new Error('fatal'),
    );

    expect(outboxService.reschedule).toHaveBeenCalledWith(
      'event-5',
      1,
      'fatal',
    );
  });

  it('should treat undefined attemptsMade as zero and skip reschedule', async () => {
    await processor.onFailed(
      {
        id: 'job-5',
        data: { outboxEventId: 'event-6' },
        opts: {},
      } as Job<{ outboxEventId: string }>,
      new Error('single failure'),
    );

    expect(outboxService.reschedule).not.toHaveBeenCalled();
  });

  it('should use attemptsMade when it is greater than retry floor', async () => {
    await processor.onFailed(
      {
        id: 'job-6',
        data: { outboxEventId: 'event-7' },
        attemptsMade: 8,
        opts: {},
      } as Job<{ outboxEventId: string }>,
      new Error('persistent failure'),
    );

    expect(outboxService.reschedule).toHaveBeenCalledWith(
      'event-7',
      8,
      'persistent failure',
    );
  });

  it('should ignore empty failed job payload', async () => {
    await expect(
      processor.onFailed(
        undefined as unknown as Job<{ outboxEventId: string }>,
        new Error('boom'),
      ),
    ).resolves.toBeUndefined();
  });
});
