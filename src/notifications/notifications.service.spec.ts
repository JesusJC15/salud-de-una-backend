import { NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { NotificationsService } from './notifications.service';
import { Notification } from './schemas/notification.schema';

type NotificationCreatePayload = Array<{
  userId: Types.ObjectId;
  type: string;
  status: string;
  message: string;
  sourceEventId?: string;
  read: boolean;
}>;

function createFindChain(result: unknown) {
  return {
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(result),
  };
}

describe('NotificationsService', () => {
  let service: NotificationsService;
  const notificationModel = {
    create: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateMany: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: getModelToken(Notification.name),
          useValue: notificationModel,
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  it('createDoctorStatusChange should create notification', async () => {
    notificationModel.create.mockResolvedValue([{}]);

    await service.createDoctorStatusChange(
      new Types.ObjectId().toString(),
      'VERIFIED',
      'ok',
    );

    expect(notificationModel.create).toHaveBeenCalled();
  });

  it('createDoctorStatusChange should handle missing notes', async () => {
    notificationModel.create.mockResolvedValue([{}]);

    await service.createDoctorStatusChange(
      new Types.ObjectId().toString(),
      'REJECTED',
    );

    const [payloads] = notificationModel.create.mock.calls[0] as [
      NotificationCreatePayload,
    ];
    const [payload] = payloads;
    expect(payload.message).toContain('REJECTED');
  });

  it('createDoctorStatusChange should ignore duplicate source event errors', async () => {
    notificationModel.create.mockRejectedValue({
      code: 11000,
      keyPattern: { sourceEventId: 1 },
    });

    await expect(
      service.createDoctorStatusChange(
        new Types.ObjectId().toString(),
        'VERIFIED',
        'ok',
        undefined,
        { sourceEventId: 'event-1' },
      ),
    ).resolves.toBeUndefined();
  });

  it('createDoctorStatusChange should rethrow non-duplicate errors', async () => {
    notificationModel.create.mockRejectedValue(new Error('db down'));

    await expect(
      service.createDoctorStatusChange(
        new Types.ObjectId().toString(),
        'VERIFIED',
      ),
    ).rejects.toThrow('db down');
  });

  it('getMine should return notifications with unread count', async () => {
    const items = [
      {
        _id: new Types.ObjectId(),
        type: 'DOCTOR_STATUS_CHANGE',
        status: 'VERIFIED',
        message: 'ok',
        read: false,
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
      },
    ];
    notificationModel.find.mockReturnValue(createFindChain(items));
    notificationModel.countDocuments.mockReturnValue({
      exec: jest.fn().mockResolvedValue(1),
    });

    const result = await service.getMine(
      {
        userId: new Types.ObjectId().toString(),
        email: 'doc@example.com',
        role: 'DOCTOR',
        isActive: true,
      },
      true,
      5,
    );

    expect(result.unreadCount).toBe(1);
    expect(result.items[0]).toMatchObject({
      type: 'DOCTOR_STATUS_CHANGE',
      read: false,
    });
  });

  it('getMine should include read items when unreadOnly is false', async () => {
    const items = [
      {
        _id: new Types.ObjectId(),
        type: 'DOCTOR_STATUS_CHANGE',
        status: 'VERIFIED',
        message: 'ok',
        read: true,
      },
    ];
    notificationModel.find.mockReturnValue(createFindChain(items));
    notificationModel.countDocuments.mockReturnValue({
      exec: jest.fn().mockResolvedValue(0),
    });

    const result = await service.getMine(
      {
        userId: new Types.ObjectId().toString(),
        email: 'doc@example.com',
        role: 'DOCTOR',
        isActive: true,
      },
      false,
      20,
    );

    expect(result.items[0].read).toBe(true);
  });

  it('getMine should cap limit to 100', async () => {
    const findChain = {
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    };
    notificationModel.find.mockReturnValue(findChain);
    notificationModel.countDocuments.mockReturnValue({
      exec: jest.fn().mockResolvedValue(0),
    });

    await service.getMine(
      {
        userId: new Types.ObjectId().toString(),
        email: 'doc@example.com',
        role: 'DOCTOR',
        isActive: true,
      },
      false,
      200,
    );

    expect(findChain.limit).toHaveBeenCalledWith(100);
  });

  it('markAsRead should throw when id is invalid', async () => {
    await expect(
      service.markAsRead('invalid', {
        userId: new Types.ObjectId().toString(),
        email: 'doc@example.com',
        role: 'DOCTOR',
        isActive: true,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('markAsRead should throw when notification does not exist', async () => {
    notificationModel.findOneAndUpdate.mockReturnValue({
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(null),
    });

    await expect(
      service.markAsRead(new Types.ObjectId().toString(), {
        userId: new Types.ObjectId().toString(),
        email: 'doc@example.com',
        role: 'DOCTOR',
        isActive: true,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('markAsRead should return updated info', async () => {
    const id = new Types.ObjectId();
    notificationModel.findOneAndUpdate.mockReturnValue({
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue({
        _id: id,
        read: true,
        readAt: new Date('2026-03-01T00:00:00.000Z'),
      }),
    });

    const result = await service.markAsRead(id.toString(), {
      userId: new Types.ObjectId().toString(),
      email: 'doc@example.com',
      role: 'DOCTOR',
      isActive: true,
    });

    expect(result).toMatchObject({
      id: id.toString(),
      read: true,
    });
  });

  it('markAllAsRead should update and return count', async () => {
    notificationModel.updateMany.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ modifiedCount: 3 }),
    });

    const result = await service.markAllAsRead({
      userId: new Types.ObjectId().toString(),
      email: 'doc@example.com',
      role: 'DOCTOR',
      isActive: true,
    });

    expect(result.updatedCount).toBe(3);
  });

  it('getMine should set limit mínimo a 1', async () => {
    const findChain = {
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    };
    notificationModel.find.mockReturnValue(findChain);
    notificationModel.countDocuments.mockReturnValue({
      exec: jest.fn().mockResolvedValue(0),
    });
    await service.getMine(
      {
        userId: new Types.ObjectId().toString(),
        email: 'doc@example.com',
        role: 'DOCTOR',
        isActive: true,
      },
      false,
      -5,
    );
    expect(findChain.limit).toHaveBeenCalledWith(1);
  });

  it('markAsRead should return already read notification', async () => {
    const id = new Types.ObjectId();
    notificationModel.findOneAndUpdate.mockReturnValue({
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue({
        _id: id,
        read: true,
        readAt: new Date('2026-03-01T00:00:00.000Z'),
      }),
    });
    const result = await service.markAsRead(id.toString(), {
      userId: new Types.ObjectId().toString(),
      email: 'doc@example.com',
      role: 'DOCTOR',
      isActive: true,
    });
    expect(result.read).toBe(true);
    expect(result.readAt).toBeInstanceOf(Date);
  });

  it('markAllAsRead should return 0 if nothing updated', async () => {
    notificationModel.updateMany.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
    });
    const result = await service.markAllAsRead({
      userId: new Types.ObjectId().toString(),
      email: 'doc@example.com',
      role: 'DOCTOR',
      isActive: true,
    });
    expect(result.updatedCount).toBe(0);
  });
});
