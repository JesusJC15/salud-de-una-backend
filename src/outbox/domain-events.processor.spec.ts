import type { Job } from 'bullmq';
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

  it('should ignore empty failed job payload', async () => {
    await expect(
      processor.onFailed(
        undefined as unknown as Job<{ outboxEventId: string }>,
        new Error('boom'),
      ),
    ).resolves.toBeUndefined();
  });
});
