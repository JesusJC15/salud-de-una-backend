import { NotificationsGateway } from './notifications.gateway';

describe('NotificationsGateway', () => {
  const authService: any = {};

  it('allows undefined origin when no config (dev)', () => {
    const gw = new NotificationsGateway(authService, null);
    expect((gw as any).isAllowedOrigin(undefined)).toBe(true);
    expect((gw as any).isAllowedOrigin('http://example.com')).toBe(true);
  });

  it('handles origin arrays and allowed origins from config', () => {
    const config: any = {
      get: (key: string) => {
        if (key === 'web.corsOriginsPatient') return ['http://a.com'];
        if (key === 'web.corsOriginsStaff') return [];
        return 'development';
      },
    };

    const gw = new NotificationsGateway(authService, config);
    expect((gw as any).isAllowedOrigin(['http://a.com', 'x'])).toBe(true);
    expect((gw as any).isAllowedOrigin('http://a.com')).toBe(true);
    expect((gw as any).isAllowedOrigin('http://b.com')).toBe(false);
  });

  it('rejects origins in production when no allowlist is configured', () => {
    const config: any = {
      get: (key: string) => {
        if (key === 'web.corsOriginsPatient') return [];
        if (key === 'web.corsOriginsStaff') return [];
        return 'production';
      },
    };

    const gw = new NotificationsGateway(authService, config);
    expect((gw as any).isAllowedOrigin('http://example.com')).toBe(false);
  });

  it('emitToUser calls socket server emit', () => {
    const gw = new NotificationsGateway(authService, null);
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    (gw as any).server = { to } as any;
    gw.emitToUser('u1', { x: 1 });
    expect(to).toHaveBeenCalledWith('user:u1');
    expect(emit).toHaveBeenCalledWith('notification:new', { x: 1 });
  });
});
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

    it('disconnects when origin is not allowed', async () => {
      const restrictedGateway = new NotificationsGateway(
        authService as never,
        {
          get: (key: string) => {
            if (key === 'web.corsOriginsPatient')
              return ['http://allowed.example.com'];
            if (key === 'web.corsOriginsStaff') return [];
            return 'production';
          },
        } as never,
      );
      const socket = makeSocket({
        handshake: {
          auth: { token: 'valid-token' },
          headers: { origin: 'http://blocked.example.com' },
        },
      });
      await restrictedGateway.handleConnection(socket as never);
      expect(socket.disconnect).toHaveBeenCalled();
      expect(authService.authenticateAccessToken).not.toHaveBeenCalled();
    });
  });
});
