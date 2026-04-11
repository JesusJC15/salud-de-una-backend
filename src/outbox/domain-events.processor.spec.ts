import type { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { DomainEventsProcessor } from './domain-events.processor';

describe('DomainEventsProcessor', () => {
  let domainEventsHandler: { processOutboxEventById: jest.Mock };
  let outboxService: { reschedule: jest.Mock };
  let processor: DomainEventsProcessor;

  beforeEach(() => {
    domainEventsHandler = {
      processOutboxEventById: jest.fn().mockResolvedValue(undefined),
    };
    outboxService = {
      reschedule: jest.fn().mockResolvedValue(undefined),
    };
    processor = new DomainEventsProcessor(
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

  it('should default attempt threshold when job options are missing', async () => {
    await processor.onFailed(
      {
        id: 'job-4',
        data: { outboxEventId: 'event-5' },
        attemptsMade: 1,
        opts: {},
      } as Job<{ outboxEventId: string }>,
      new Error('fatal'),
    );

    expect(outboxService.reschedule).toHaveBeenCalledWith('event-5', 5, 'fatal');
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
