import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import type { Model } from 'mongoose';
import type { ProvisioningService } from '../auth/provisioning.service';
import { AdminSeederService } from './admin-seeder.service';
import type { AdminDocument } from './schemas/admin.schema';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
}));

describe('AdminSeederService', () => {
  const adminModel = {
    findOne: jest.fn(),
    create: jest.fn(),
  };
  const getManagementTokenPublic = jest.fn().mockResolvedValue('token');
  const setUserDbId = jest.fn().mockResolvedValue(undefined);
  let configService: ConfigService;
  let warnSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    adminModel.findOne.mockReset();
    adminModel.create.mockReset();
    getManagementTokenPublic.mockClear();
    setUserDbId.mockClear();
  });

  afterEach(() => {
    warnSpy.mockRestore();
    logSpy.mockRestore();
    jest.restoreAllMocks();
  });

  const provisioningService = {
    getManagementTokenPublic,
    setUserDbId,
  } as unknown as ProvisioningService;

  function createService(values: Record<string, unknown>) {
    configService = {
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService;
    return new AdminSeederService(
      adminModel as unknown as Model<AdminDocument>,
      configService,
      provisioningService,
    );
  }

  it('should skip when bootstrap is disabled', async () => {
    const service = createService({ ENABLE_BOOTSTRAP_ADMIN: false });
    await service.onApplicationBootstrap();
    expect(adminModel.findOne).not.toHaveBeenCalled();
    expect(adminModel.create).not.toHaveBeenCalled();
  });

  it('should warn when enabled but missing credentials', async () => {
    const service = createService({
      ENABLE_BOOTSTRAP_ADMIN: true,
      BOOTSTRAP_ADMIN_EMAIL: undefined,
      BOOTSTRAP_ADMIN_PASSWORD: undefined,
    });

    await service.onApplicationBootstrap();

    expect(warnSpy).toHaveBeenCalled();
    expect(adminModel.create).not.toHaveBeenCalled();
  });

  it('should skip create when admin already exists and sync to Auth0', async () => {
    const service = createService({
      ENABLE_BOOTSTRAP_ADMIN: true,
      BOOTSTRAP_ADMIN_EMAIL: 'Admin@Example.com',
      BOOTSTRAP_ADMIN_PASSWORD: 'AdminP@ss1',
    });
    adminModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ _id: 'admin1', id: 'admin1' }),
    });

    await service.onApplicationBootstrap();

    expect(adminModel.findOne).toHaveBeenCalledWith({
      email: 'admin@example.com',
    });
    expect(adminModel.create).not.toHaveBeenCalled();
  });

  it('should create admin when enabled and not exists', async () => {
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-pass');
    const service = createService({
      ENABLE_BOOTSTRAP_ADMIN: true,
      BOOTSTRAP_ADMIN_EMAIL: 'Admin@Example.com',
      BOOTSTRAP_ADMIN_PASSWORD: 'AdminP@ss1',
      BOOTSTRAP_ADMIN_FIRST_NAME: 'System',
      BOOTSTRAP_ADMIN_LAST_NAME: 'Admin',
    });
    adminModel.create.mockResolvedValue({ id: 'new-admin-id' });
    adminModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });

    await service.onApplicationBootstrap();

    expect(adminModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'admin@example.com',
        passwordHash: 'hashed-pass',
      }),
    );
    expect(logSpy).toHaveBeenCalled();
  });

  it('should warn and skip Auth0 sync when domain is missing', async () => {
    const service = createService({
      ENABLE_BOOTSTRAP_ADMIN: true,
      BOOTSTRAP_ADMIN_EMAIL: 'Admin@Example.com',
      BOOTSTRAP_ADMIN_PASSWORD: 'AdminP@ss1',
    });
    adminModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ _id: 'admin1', id: 'admin1' }),
    });

    await service.onApplicationBootstrap();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('AUTH0_DOMAIN no configurado'),
    );
    expect(getManagementTokenPublic).not.toHaveBeenCalled();
  });

  it('should warn when Auth0 search fails', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
    } as never);
    const service = createService({
      ENABLE_BOOTSTRAP_ADMIN: true,
      BOOTSTRAP_ADMIN_EMAIL: 'Admin@Example.com',
      BOOTSTRAP_ADMIN_PASSWORD: 'AdminP@ss1',
      'auth.auth0Domain': 'tenant.example.com',
    });
    adminModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ _id: 'admin1', id: 'admin1' }),
    });

    await service.onApplicationBootstrap();

    expect(fetchSpy).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('No se pudo buscar el admin en Auth0: 503'),
    );
  });

  it('should link an existing Auth0 user to the MongoDB admin', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ user_id: 'auth0|123' }]),
    } as never);
    const service = createService({
      ENABLE_BOOTSTRAP_ADMIN: true,
      BOOTSTRAP_ADMIN_EMAIL: 'Admin@Example.com',
      BOOTSTRAP_ADMIN_PASSWORD: 'AdminP@ss1',
      'auth.auth0Domain': 'tenant.example.com',
    });
    adminModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ _id: 'admin1', id: 'admin1' }),
    });

    await service.onApplicationBootstrap();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(setUserDbId).toHaveBeenCalledWith('auth0|123', 'admin1', 'ADMIN');
  });

  it('should warn when Auth0 create fails for a new admin', async () => {
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-pass');
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      } as never)
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve('bad request'),
      } as never);
    const service = createService({
      ENABLE_BOOTSTRAP_ADMIN: true,
      BOOTSTRAP_ADMIN_EMAIL: 'Admin@Example.com',
      BOOTSTRAP_ADMIN_PASSWORD: 'AdminP@ss1',
      'auth.auth0Domain': 'tenant.example.com',
    });
    adminModel.create.mockResolvedValue({ id: 'new-admin-id' });
    adminModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });

    await service.onApplicationBootstrap();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('No se pudo crear el admin en Auth0: 400'),
    );
  });

  it('should swallow Auth0 sync exceptions and warn', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('network unavailable'));
    const service = createService({
      ENABLE_BOOTSTRAP_ADMIN: true,
      BOOTSTRAP_ADMIN_EMAIL: 'Admin@Example.com',
      BOOTSTRAP_ADMIN_PASSWORD: 'AdminP@ss1',
      'auth.auth0Domain': 'tenant.example.com',
    });
    adminModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ _id: 'admin1', id: 'admin1' }),
    });

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Error al sincronizar admin bootstrap con Auth0: network unavailable',
      ),
    );
  });
});
