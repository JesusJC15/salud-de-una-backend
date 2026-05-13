import { NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { UserRole } from '../common/enums/user-role.enum';
import { PushNotificationsService } from './push-notifications.service';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
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

type SendToUserMock = jest.MockedFunction<
  PushNotificationsService['sendToUser']
>;

describe('NotificationsService', () => {
  let service: NotificationsService;
  const notificationModel = {
    create: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateMany: jest.fn(),
  };
  const pushNotificationsService: { sendToUser: SendToUserMock } = {
    sendToUser: jest.fn(),
  };
  const notificationsGateway = {
    emitToUser: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    notificationModel.create.mockResolvedValue([
      {
        _id: new Types.ObjectId(),
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
      },
    ]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: getModelToken(Notification.name),
          useValue: notificationModel,
        },
        {
          provide: PushNotificationsService,
          useValue: pushNotificationsService,
        },
        {
          provide: NotificationsGateway,
          useValue: notificationsGateway,
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  it('createDoctorStatusChange should create notification', async () => {
    notificationModel.create.mockResolvedValue([
      {
        _id: new Types.ObjectId(),
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
      },
    ]);

    await service.createDoctorStatusChange(
      new Types.ObjectId().toString(),
      'VERIFIED',
      'ok',
    );

    expect(notificationModel.create).toHaveBeenCalled();
    expect(notificationsGateway.emitToUser).toHaveBeenCalled();
  });

  it('createDoctorStatusChange should handle missing notes', async () => {
    notificationModel.create.mockResolvedValue([
      {
        _id: new Types.ObjectId(),
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
      },
    ]);

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

  it('createUserNotification should persist and send push when payload includes push data', async () => {
    notificationModel.create.mockResolvedValue([
      {
        _id: new Types.ObjectId(),
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
      },
    ]);
    pushNotificationsService.sendToUser.mockResolvedValue({
      sent: 1,
      removedTokens: [],
    });

    await service.createUserNotification({
      userId: new Types.ObjectId().toString(),
      type: 'CHAT_MESSAGE',
      status: 'NEW',
      message: 'Nuevo mensaje',
      resourceId: 'consultation-1',
      deepLink: '/consultations/1',
      push: {
        title: 'Nuevo mensaje',
        body: 'Tienes un mensaje',
        data: { consultationId: 'consultation-1' },
      },
    });

    expect(notificationModel.create).toHaveBeenCalled();
    expect(pushNotificationsService.sendToUser).toHaveBeenCalledTimes(1);
    const pushCall = pushNotificationsService.sendToUser.mock.calls[0]?.[0];
    expect(pushCall).toBeDefined();
    expect(pushCall).toMatchObject({
      title: 'Nuevo mensaje',
      body: 'Tienes un mensaje',
      data: { consultationId: 'consultation-1' },
    });
    expect(pushCall?.userId).toEqual(expect.any(String));
    expect(notificationsGateway.emitToUser).toHaveBeenCalled();
  });

  it('createUserNotification should accept a session and still emit locally', async () => {
    notificationModel.create.mockResolvedValue([
      {
        _id: new Types.ObjectId(),
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
      },
    ]);

    const session = {} as never;
    await service.createUserNotification({
      userId: new Types.ObjectId().toString(),
      type: 'SYSTEM',
      status: 'INFO',
      message: 'Con session',
      session,
    });

    expect(notificationModel.create).toHaveBeenCalledWith(expect.any(Array), {
      session,
    });
    expect(notificationsGateway.emitToUser).toHaveBeenCalled();
  });

  it('createUserNotification should skip push delivery when push payload is absent', async () => {
    notificationModel.create.mockResolvedValue([
      {
        _id: new Types.ObjectId(),
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
      },
    ]);

    await service.createUserNotification({
      userId: new Types.ObjectId().toString(),
      type: 'SYSTEM',
      status: 'INFO',
      message: 'Solo inbox',
    });

    expect(pushNotificationsService.sendToUser).not.toHaveBeenCalled();
  });

  it('createUserNotification should ignore duplicate source event errors', async () => {
    notificationModel.create.mockRejectedValue({
      code: 11000,
      keyPattern: { sourceEventId: 1 },
    });

    await expect(
      service.createUserNotification({
        userId: new Types.ObjectId().toString(),
        type: 'SYSTEM',
        status: 'INFO',
        message: 'Duplicada',
        sourceEventId: 'event-1',
      }),
    ).resolves.toBeUndefined();
  });

  it('isDuplicateSourceEvent should only match sourceEventId duplicates', () => {
    expect(
      (
        service as unknown as {
          isDuplicateSourceEvent(error: unknown): boolean;
        }
      ).isDuplicateSourceEvent({ code: 11000, keyPattern: { other: 1 } }),
    ).toBe(false);
    expect(
      (
        service as unknown as {
          isDuplicateSourceEvent(error: unknown): boolean;
        }
      ).isDuplicateSourceEvent({
        code: 11000,
        keyPattern: { sourceEventId: 1 },
      }),
    ).toBe(true);
  });

  it('createUserNotification should rethrow non-duplicate persistence errors', async () => {
    notificationModel.create.mockRejectedValue(new Error('db fail'));

    await expect(
      service.createUserNotification({
        userId: new Types.ObjectId().toString(),
        type: 'SYSTEM',
        status: 'INFO',
        message: 'Duplicada',
      }),
    ).rejects.toThrow('db fail');
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
        role: UserRole.DOCTOR,
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
        role: UserRole.DOCTOR,
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
        role: UserRole.DOCTOR,
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
        role: UserRole.DOCTOR,
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
        role: UserRole.DOCTOR,
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
      role: UserRole.DOCTOR,
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
      role: UserRole.DOCTOR,
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
        role: UserRole.DOCTOR,
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
      role: UserRole.DOCTOR,
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
      role: UserRole.DOCTOR,
      isActive: true,
    });
    expect(result.updatedCount).toBe(0);
  });
});
