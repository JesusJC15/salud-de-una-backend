import { DoctorStatus } from '../common/enums/doctor-status.enum';
import { OutboxService } from './outbox.service';

describe('OutboxService', () => {
  let outboxEventModel: {
    create: jest.Mock;
    findOneAndUpdate: jest.Mock;
    findById: jest.Mock;
    updateOne: jest.Mock;
  };
  let service: OutboxService;

  beforeEach(() => {
    outboxEventModel = {
      create: jest.fn(),
      findOneAndUpdate: jest.fn(),
      findById: jest.fn(),
      updateOne: jest.fn(),
    };
    service = new OutboxService(outboxEventModel as never);
  });

  it('should create doctor verification changed event', async () => {
    outboxEventModel.create.mockResolvedValue([{ id: 'event-1' }]);

    const result = await service.createDoctorVerificationChangedEvent(
      {
        doctorId: 'doctor-1',
        doctorStatus: DoctorStatus.VERIFIED,
        notes: 'ok',
      },
      'corr-1',
    );

    expect(outboxEventModel.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          eventType: 'doctor.verification.changed.v1',
          aggregateType: 'doctor',
          aggregateId: 'doctor-1',
          correlationId: 'corr-1',
          status: 'pending',
        }),
      ],
      undefined,
    );
    expect(result).toEqual({ id: 'event-1' });
  });

  it('should create doctor verification event using mongo session when provided', async () => {
    const session = { id: 'session-1' };
    outboxEventModel.create.mockResolvedValue([{ id: 'event-session' }]);

    await service.createDoctorVerificationChangedEvent(
      {
        doctorId: 'doctor-2',
        doctorStatus: DoctorStatus.PENDING,
      },
      'corr-2',
      session as never,
    );

    expect(outboxEventModel.create).toHaveBeenCalledWith(
      [expect.objectContaining({ aggregateId: 'doctor-2' })],
      { session },
    );
  });

  it('should claim next pending event', async () => {
    outboxEventModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ id: 'event-2' }),
    });

    await expect(service.claimNextPendingEvent()).resolves.toEqual({
      id: 'event-2',
    });
  });

  it('should find event by id', async () => {
    outboxEventModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ id: 'event-3' }),
    });

    await expect(service.findById('event-3')).resolves.toEqual({
      id: 'event-3',
    });
  });

  it('should mark event processed', async () => {
    outboxEventModel.updateOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    });

    await service.markProcessed('event-4');
    const [, updatePayload] = outboxEventModel.updateOne.mock.calls[0] as [
      { _id: string },
      {
        $set: {
          status: string;
          processedAt: Date;
          lastError?: string;
        };
      },
    ];

    expect(outboxEventModel.updateOne).toHaveBeenCalledWith(
      { _id: 'event-4' },
      expect.any(Object),
    );
    expect(updatePayload.$set.status).toBe('processed');
  });

  it('should reschedule pending events with backoff', async () => {
    outboxEventModel.updateOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    });

    await service.reschedule('event-5', 2, 'failed');
    const [, updatePayload] = outboxEventModel.updateOne.mock.calls[0] as [
      { _id: string },
      {
        $set: {
          status: string;
          lastError: string;
        };
      },
    ];

    expect(outboxEventModel.updateOne).toHaveBeenCalledWith(
      { _id: 'event-5' },
      expect.any(Object),
    );
    expect(updatePayload.$set.status).toBe('pending');
    expect(updatePayload.$set.lastError).toBe('failed');
  });

  it('should mark event as failed after max attempts', async () => {
    outboxEventModel.updateOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    });

    await service.reschedule('event-6', 5, 'failed-hard');
    const [, updatePayload] = outboxEventModel.updateOne.mock.calls[0] as [
      { _id: string },
      {
        $set: {
          status: string;
          lastError: string;
        };
      },
    ];

    expect(outboxEventModel.updateOne).toHaveBeenCalledWith(
      { _id: 'event-6' },
      expect.any(Object),
    );
    expect(updatePayload.$set.status).toBe('failed');
    expect(updatePayload.$set.lastError).toBe('failed-hard');
  });

  it('should handle zero attempts using immediate backoff baseline', async () => {
    outboxEventModel.updateOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    });

    await service.reschedule('event-7', 0, 'first-failure');
    const [, updatePayload] = outboxEventModel.updateOne.mock.calls[0] as [
      { _id: string },
      {
        $set: {
          status: string;
          availableAt: Date;
          lastError: string;
        };
      },
    ];

    expect(updatePayload.$set.status).toBe('pending');
    expect(updatePayload.$set.availableAt).toBeInstanceOf(Date);
    expect(updatePayload.$set.lastError).toBe('first-failure');
  });

  it('should keep failed events at current time even with high attempts', async () => {
    outboxEventModel.updateOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    });

    const before = Date.now();
    await service.reschedule('event-8', 10, 'many-failures');
    const after = Date.now();
    const [, updatePayload] = outboxEventModel.updateOne.mock.calls[0] as [
      { _id: string },
      {
        $set: {
          status: string;
          availableAt: Date;
          lastError: string;
        };
      },
    ];

    expect(updatePayload.$set.status).toBe('failed');
    expect(updatePayload.$set.availableAt.getTime()).toBeGreaterThanOrEqual(
      before,
    );
    expect(updatePayload.$set.availableAt.getTime()).toBeLessThanOrEqual(after);
  });
});
