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
  });

  afterEach(() => {
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  const provisioningService = {
    getManagementTokenPublic: jest.fn().mockResolvedValue('token'),
    setUserDbId: jest.fn().mockResolvedValue(undefined),
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
});
