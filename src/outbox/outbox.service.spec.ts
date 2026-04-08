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

  it('should claim next pending event', async () => {
    outboxEventModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ id: 'event-2' }),
    });

    await expect(service.claimNextPendingEvent()).resolves.toEqual({
      id: 'event-2',
    });

    const [query, updatePayload, options] =
      outboxEventModel.findOneAndUpdate.mock.calls[0] as [
        {
          $or: Array<Record<string, unknown>>;
        },
        {
          $set: {
            status: string;
            availableAt: Date;
            lastError?: string;
          };
          $inc: {
            attempts: number;
          };
        },
        {
          sort: {
            createdAt: 1;
          };
          returnDocument: string;
        },
      ];

    expect(query.$or).toHaveLength(2);
    expect(query.$or).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'pending' }),
        expect.objectContaining({ status: 'dispatched' }),
      ]),
    );
    expect(updatePayload.$set.status).toBe('dispatched');
    expect(updatePayload.$set.availableAt).toBeInstanceOf(Date);
    expect(updatePayload.$inc.attempts).toBe(1);
    expect(options).toEqual({
      sort: { createdAt: 1 },
      returnDocument: 'after',
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
});
