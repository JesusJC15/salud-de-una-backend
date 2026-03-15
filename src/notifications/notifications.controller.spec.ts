import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let service: {
    getMine: jest.Mock;
    markAsRead: jest.Mock;
    markAllAsRead: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      getMine: jest.fn(),
      markAsRead: jest.fn(),
      markAllAsRead: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [{ provide: NotificationsService, useValue: service }],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
  });

  it('getMine should call service', async () => {
    service.getMine.mockResolvedValue({ items: [], unreadCount: 0 });

    const result = await controller.getMine(
      {
        user: {
          userId: 'u1',
          email: 'doc@example.com',
          role: 'DOCTOR',
          isActive: true,
        },
      },
      { unreadOnly: true, limit: 10 },
    );

    expect(service.getMine).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1' }),
      true,
      10,
    );
    expect(result).toEqual({ items: [], unreadCount: 0 });
  });

  it('getMine should use defaults when query is empty', async () => {
    service.getMine.mockResolvedValue({ items: [], unreadCount: 0 });

    await controller.getMine(
      {
        user: {
          userId: 'u1',
          email: 'doc@example.com',
          role: 'DOCTOR',
          isActive: true,
        },
      },
      {},
    );

    expect(service.getMine).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1' }),
      false,
      20,
    );
  });

  it('markAsRead should call service', async () => {
    service.markAsRead.mockResolvedValue({ id: 'n1', read: true });

    const result = await controller.markAsRead(
      {
        user: {
          userId: 'u1',
          email: 'doc@example.com',
          role: 'DOCTOR',
          isActive: true,
        },
      },
      'n1',
    );

    expect(service.markAsRead).toHaveBeenCalledWith(
      'n1',
      expect.objectContaining({ userId: 'u1' }),
    );
    expect(result).toEqual({ id: 'n1', read: true });
  });

  it('markAllAsRead should call service', async () => {
    service.markAllAsRead.mockResolvedValue({ updatedCount: 3 });

    const result = await controller.markAllAsRead({
      user: {
        userId: 'u1',
        email: 'doc@example.com',
        role: 'DOCTOR',
        isActive: true,
      },
    });

    expect(service.markAllAsRead).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1' }),
    );
    expect(result).toEqual({ updatedCount: 3 });
  });
});
