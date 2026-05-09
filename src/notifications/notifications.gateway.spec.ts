import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth/auth.service';
import { UserRole } from '../common/enums/user-role.enum';
import { NotificationsGateway } from './notifications.gateway';

type MockSocket = {
  handshake: {
    auth?: Record<string, unknown>;
    headers: Record<string, string>;
  };
  data: Record<string, unknown>;
  join: jest.Mock;
  disconnect: jest.Mock;
};

function makeSocket(overrides: Partial<MockSocket> = {}): MockSocket {
  return {
    handshake: { auth: {}, headers: {} },
    data: {},
    join: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
    ...overrides,
  };
}

describe('NotificationsGateway', () => {
  let gateway: NotificationsGateway;
  let authService: { authenticateAccessToken: jest.Mock };

  const validUser = {
    userId: 'user-1',
    email: 'u@example.com',
    role: UserRole.PATIENT,
    isActive: true,
  };

  beforeEach(async () => {
    authService = {
      authenticateAccessToken: jest.fn().mockResolvedValue(validUser),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsGateway,
        { provide: AuthService, useValue: authService },
      ],
    }).compile();

    gateway = module.get<NotificationsGateway>(NotificationsGateway);
  });

  describe('handleConnection', () => {
    it('disconnects when no token provided', async () => {
      const socket = makeSocket({ handshake: { auth: {}, headers: {} } });
      await gateway.handleConnection(socket as never);
      expect(socket.disconnect).toHaveBeenCalled();
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('disconnects when token is invalid', async () => {
      authService.authenticateAccessToken.mockRejectedValueOnce(
        new Error('invalid'),
      );
      const socket = makeSocket({
        handshake: { auth: { token: 'bad-token' }, headers: {} },
      });
      await gateway.handleConnection(socket as never);
      expect(socket.disconnect).toHaveBeenCalled();
    });

    it('disconnects when auth returns null', async () => {
      authService.authenticateAccessToken.mockResolvedValueOnce(null);
      const socket = makeSocket({
        handshake: { auth: { token: 'some-token' }, headers: {} },
      });
      await gateway.handleConnection(socket as never);
      expect(socket.disconnect).toHaveBeenCalled();
    });

    it('joins user room when token is valid', async () => {
      const socket = makeSocket({
        handshake: { auth: { token: 'valid-token' }, headers: {} },
      });
      await gateway.handleConnection(socket as never);
      expect(socket.disconnect).not.toHaveBeenCalled();
      expect(socket.join).toHaveBeenCalledWith('user:user-1');
      expect(socket.data.user).toEqual(validUser);
    });

    it('extracts token from Authorization header as fallback', async () => {
      const socket = makeSocket({
        handshake: {
          auth: {},
          headers: { authorization: 'Bearer header-token' },
        },
      });
      await gateway.handleConnection(socket as never);
      expect(authService.authenticateAccessToken).toHaveBeenCalledWith(
        'header-token',
      );
    });
  });
});
