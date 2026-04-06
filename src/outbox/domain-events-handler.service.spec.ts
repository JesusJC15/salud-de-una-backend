import { Test, TestingModule } from '@nestjs/testing';
import { DomainEventsHandlerService } from './domain-events-handler.service';
import { OutboxService } from './outbox.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('DomainEventsHandlerService', () => {
  let service: DomainEventsHandlerService;
  const outboxService = {
    findById: jest.fn(),
    markProcessed: jest.fn(),
    reschedule: jest.fn(),
  };
  const notificationsService = {
    createDoctorStatusChange: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DomainEventsHandlerService,
        { provide: OutboxService, useValue: outboxService },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();

    service = module.get<DomainEventsHandlerService>(
      DomainEventsHandlerService,
    );
  });

  it('should create notification and mark event processed', async () => {
    outboxService.findById.mockResolvedValue({
      id: 'event-1',
      eventType: 'doctor.verification.changed.v1',
      attempts: 1,
      payload: {
        doctorId: 'doctor-1',
        doctorStatus: 'VERIFIED',
        notes: 'ok',
      },
    });

    await service.processOutboxEventById('event-1');

    expect(notificationsService.createDoctorStatusChange).toHaveBeenCalledWith(
      'doctor-1',
      'VERIFIED',
      'ok',
      undefined,
      { sourceEventId: 'event-1' },
    );
    expect(outboxService.markProcessed).toHaveBeenCalledWith('event-1');
  });

  it('should reschedule event on processing failure', async () => {
    outboxService.findById.mockResolvedValue({
      id: 'event-2',
      eventType: 'doctor.verification.changed.v1',
      attempts: 2,
      payload: {
        doctorId: 'doctor-2',
        doctorStatus: 'REJECTED',
      },
    });
    notificationsService.createDoctorStatusChange.mockRejectedValue(
      new Error('failed'),
    );

    await expect(service.processOutboxEventById('event-2')).rejects.toThrow(
      'failed',
    );
    expect(outboxService.reschedule).not.toHaveBeenCalled();
    expect(outboxService.markProcessed).not.toHaveBeenCalled();
  });

  it('should reject unknown event types without marking them processed', async () => {
    outboxService.findById.mockResolvedValue({
      id: 'event-3',
      eventType: 'doctor.unknown.v1',
      attempts: 1,
      payload: {
        doctorId: 'doctor-3',
        doctorStatus: 'VERIFIED',
      },
    });

    await expect(service.processOutboxEventById('event-3')).rejects.toThrow(
      'Unhandled outbox event type: doctor.unknown.v1',
    );
    expect(notificationsService.createDoctorStatusChange).not.toHaveBeenCalled();
    expect(outboxService.markProcessed).not.toHaveBeenCalled();
  });

  it('should reject invalid payloads without marking them processed', async () => {
    outboxService.findById.mockResolvedValue({
      id: 'event-4',
      eventType: 'doctor.verification.changed.v1',
      attempts: 1,
      payload: {
        doctorId: 'doctor-4',
      },
    });

    await expect(service.processOutboxEventById('event-4')).rejects.toThrow(
      'Invalid payload for outbox event event-4',
    );
    expect(notificationsService.createDoctorStatusChange).not.toHaveBeenCalled();
    expect(outboxService.markProcessed).not.toHaveBeenCalled();
  });
});
