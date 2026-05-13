import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Server } from 'socket.io';
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

type GatewayInternals = {
  isAllowedOrigin(origin?: string | string[]): boolean;
  server: Pick<Server, 'to'>;
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
  const authService = {
    authenticateAccessToken: jest.fn(),
  } as unknown as AuthService;

  const getInternals = (gateway: NotificationsGateway): GatewayInternals =>
    gateway as unknown as GatewayInternals;

  it('allows undefined origin when no config (dev)', () => {
    const gateway = new NotificationsGateway(authService, null);

    expect(getInternals(gateway).isAllowedOrigin(undefined)).toBe(true);
    expect(getInternals(gateway).isAllowedOrigin('http://example.com')).toBe(
      true,
    );
  });

  it('handles origin arrays and allowed origins from config', () => {
    const config = {
      get: (key: string) => {
        if (key === 'web.corsOriginsPatient') {
          return ['http://a.com'];
        }
        if (key === 'web.corsOriginsStaff') {
          return [];
        }
        return 'development';
      },
    } as unknown as ConfigService;

    const gateway = new NotificationsGateway(authService, config);

    expect(getInternals(gateway).isAllowedOrigin(['http://a.com', 'x'])).toBe(
      true,
    );
    expect(getInternals(gateway).isAllowedOrigin('http://a.com')).toBe(true);
    expect(getInternals(gateway).isAllowedOrigin('http://b.com')).toBe(false);
  });

  it('rejects origins in production when no allowlist is configured', () => {
    const config = {
      get: (key: string) => {
        if (
          key === 'web.corsOriginsPatient' ||
          key === 'web.corsOriginsStaff'
        ) {
          return [];
        }
        return 'production';
      },
    } as unknown as ConfigService;

    const gateway = new NotificationsGateway(authService, config);

    expect(getInternals(gateway).isAllowedOrigin('http://example.com')).toBe(
      false,
    );
  });

  it('emitToUser calls socket server emit', () => {
    const gateway = new NotificationsGateway(authService, null);
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });

    getInternals(gateway).server = { to };

    gateway.emitToUser('u1', { x: 1 });

    expect(to).toHaveBeenCalledWith('user:u1');
    expect(emit).toHaveBeenCalledWith('notification:new', { x: 1 });
  });
});

describe('NotificationsGateway handleConnection', () => {
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
      authService as unknown as AuthService,
      {
        get: (key: string) => {
          if (key === 'web.corsOriginsPatient') {
            return ['http://allowed.example.com'];
          }
          if (key === 'web.corsOriginsStaff') {
            return [];
          }
          return 'production';
        },
      } as unknown as ConfigService,
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
