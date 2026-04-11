import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { OutboxDispatcherService } from './outbox-dispatcher.service';

describe('OutboxDispatcherService', () => {
  let configService: { get: jest.Mock };
  let outboxService: {
    claimNextPendingEvent: jest.Mock;
    reschedule: jest.Mock;
  };
  let domainEventsHandler: { processOutboxEventById: jest.Mock };
  let domainEventsQueue: { add: jest.Mock } | null;

  function createService(): OutboxDispatcherService {
    return new OutboxDispatcherService(
      configService as unknown as ConfigService,
      outboxService as never,
      domainEventsHandler as never,
      domainEventsQueue as never,
    );
  }

  beforeEach(() => {
    jest.useFakeTimers();
    configService = {
      get: jest.fn().mockReturnValue(10),
    };
    outboxService = {
      claimNextPendingEvent: jest.fn().mockResolvedValue(null),
      reschedule: jest.fn().mockResolvedValue(undefined),
    };
    domainEventsHandler = {
      processOutboxEventById: jest.fn().mockResolvedValue(undefined),
    };
    domainEventsQueue = null;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should schedule dispatch on application bootstrap and clear on shutdown', () => {
    const service = createService();
    const dispatchSpy = jest
      .spyOn(service, 'dispatchPendingEvents')
      .mockResolvedValue(undefined);

    service.onApplicationBootstrap();
    jest.advanceTimersByTime(10);
    service.onApplicationShutdown();

    expect(dispatchSpy).toHaveBeenCalled();
  });

  it('should use default dispatch interval when config is missing', () => {
    configService.get.mockReturnValue(undefined);
    const service = createService();
    const dispatchSpy = jest
      .spyOn(service, 'dispatchPendingEvents')
      .mockResolvedValue(undefined);

    service.onApplicationBootstrap();
    jest.advanceTimersByTime(1000);
    service.onApplicationShutdown();

    expect(dispatchSpy).toHaveBeenCalled();
  });

  it('should not fail shutdown when interval was never started', () => {
    const service = createService();
    expect(() => service.onApplicationShutdown()).not.toThrow();
  });

  it('should process events directly when queue is unavailable', async () => {
    outboxService.claimNextPendingEvent
      .mockResolvedValueOnce({
        id: 'event-1',
        eventType: 'doctor.verification.changed.v1',
        attempts: 1,
      })
      .mockResolvedValueOnce(null);
    const service = createService();

    await service.dispatchPendingEvents();

    expect(domainEventsHandler.processOutboxEventById).toHaveBeenCalledWith(
      'event-1',
    );
  });

  it('should enqueue events when queue is available', async () => {
    domainEventsQueue = {
      add: jest.fn().mockResolvedValue(undefined),
    };
    outboxService.claimNextPendingEvent
      .mockResolvedValueOnce({
        id: 'event-2',
        eventType: 'doctor.verification.changed.v1',
        attempts: 1,
      })
      .mockResolvedValueOnce(null);
    const service = createService();

    await service.dispatchPendingEvents();

    expect(domainEventsQueue.add).toHaveBeenCalledWith(
      'doctor.verification.changed.v1',
      { outboxEventId: 'event-2' },
      expect.objectContaining({
        jobId: 'event-2',
        attempts: 5,
      }),
    );
  });

  it('should reschedule event when dispatch fails', async () => {
    domainEventsQueue = {
      add: jest.fn().mockRejectedValue(new Error('queue down')),
    };
    outboxService.claimNextPendingEvent
      .mockResolvedValueOnce({
        id: 'event-3',
        eventType: 'doctor.verification.changed.v1',
        attempts: 2,
      })
      .mockResolvedValueOnce(null);
    const service = createService();

    await service.dispatchPendingEvents();

    expect(outboxService.reschedule).toHaveBeenCalledWith(
      'event-3',
      2,
      'queue down',
    );
  });

  it('should stringify non-Error dispatch failures', async () => {
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    domainEventsQueue = {
      add: jest.fn().mockRejectedValue('queue unavailable'),
    };
    outboxService.claimNextPendingEvent
      .mockResolvedValueOnce({
        id: 'event-4',
        eventType: 'doctor.verification.changed.v1',
        attempts: 3,
      })
      .mockResolvedValueOnce(null);
    const service = createService();

    await service.dispatchPendingEvents();

    expect(outboxService.reschedule).toHaveBeenCalledWith(
      'event-4',
      3,
      'queue unavailable',
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('queue unavailable'),
    );
    warnSpy.mockRestore();
  });

  it('should skip when dispatcher is already running', async () => {
    const service = createService();

    (service as unknown as { running: boolean }).running = true;
    await service.dispatchPendingEvents();

    expect(outboxService.claimNextPendingEvent).not.toHaveBeenCalled();
  });
});
