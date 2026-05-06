import { ValidationPipe } from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import * as bcrypt from 'bcrypt';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import {
  Connection,
  ConnectionStates,
  Model,
  type HydratedDocument,
  Types,
} from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { AiService } from '../../../src/ai/ai.service';
import {
  Admin,
  type AdminDocument,
} from '../../../src/admins/schemas/admin.schema';
import { HttpExceptionFilter } from '../../../src/common/filters/http-exception.filter';
import { Notification } from '../../../src/notifications/schemas/notification.schema';
import { buildAdminSeed, uniqueValue } from './builders';
import type { AuthSessionResponseBody } from './contracts';

jest.mock('dotenv/config', () => ({}));

type E2eEnvironmentOptions = {
  aiEnabled?: boolean;
  aiOverride?: Partial<AiService>;
  env?: Record<string, string>;
};

const AUTH_LOGIN_PATH_BY_CLIENT = {
  patient: '/v1/auth/patient/login',
  staff: '/v1/auth/staff/login',
} as const;

const hashCache = new Map<string, Promise<string>>();

async function hashPassword(password: string) {
  const cached = hashCache.get(password);
  if (cached) {
    return cached;
  }

  const pending = bcrypt.hash(password, 12);
  hashCache.set(password, pending);
  return pending;
}

export class E2eTestContext {
  private readonly originalEnv: Record<string, string | undefined> = {
    NODE_ENV: process.env.NODE_ENV,
    MONGODB_URI: process.env.MONGODB_URI,
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN,
    JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN,
    ENABLE_BOOTSTRAP_ADMIN: process.env.ENABLE_BOOTSTRAP_ADMIN,
    AI_ENABLED: process.env.AI_ENABLED,
    AI_PROVIDER: process.env.AI_PROVIDER,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
    REDIS_URL: process.env.REDIS_URL,
    REDIS_KEY_PREFIX: process.env.REDIS_KEY_PREFIX,
    OUTBOX_DISPATCH_INTERVAL_MS: process.env.OUTBOX_DISPATCH_INTERVAL_MS,
    DOTENV_CONFIG_PATH: process.env.DOTENV_CONFIG_PATH,
  };

  private app?: import('@nestjs/common').INestApplication<App>;
  private connection?: Connection;
  private mongoServer?: MongoMemoryReplSet;
  private isClosing = false;

  static async create(options: E2eEnvironmentOptions = {}) {
    const context = new E2eTestContext();
    await context.bootstrap(options);
    return context;
  }

  getApp() {
    if (!this.app) {
      throw new Error('E2E app is not initialized');
    }

    return this.app;
  }

  request() {
    return request(this.getApp().getHttpServer());
  }

  getModel<T extends HydratedDocument<unknown>>(modelName: string) {
    return this.getApp().get<Model<T>>(getModelToken(modelName));
  }

  async resetDatabase() {
    if (!this.connection) {
      return;
    }

    const collections = Object.values(this.connection.collections);
    await Promise.all(
      collections.map((collection) => collection.deleteMany({})),
    );
  }

  async resetState(options: { seedDefaultAdmin?: boolean } = {}) {
    await this.resetDatabase();

    if (options.seedDefaultAdmin) {
      await this.seedAdmin();
    }
  }

  async seedAdmin(overrides: Partial<ReturnType<typeof buildAdminSeed>> = {}) {
    const admin = buildAdminSeed(overrides);
    const adminModel = this.getModel<AdminDocument>(Admin.name);

    await adminModel.create({
      firstName: admin.firstName,
      lastName: admin.lastName,
      email: admin.email,
      passwordHash: await hashPassword(admin.password),
    });

    return admin;
  }

  async loginSession(
    email: string,
    password: string,
    client: 'patient' | 'staff',
  ): Promise<AuthSessionResponseBody> {
    const response = await this.request()
      .post(AUTH_LOGIN_PATH_BY_CLIENT[client])
      .send({ email, password })
      .expect(200);

    return response.body as AuthSessionResponseBody;
  }

  async login(email: string, password: string, client: 'patient' | 'staff') {
    const session = await this.loginSession(email, password, client);
    return session.accessToken;
  }

  async waitForNotificationCount(
    userId: string,
    expectedCount: number,
    timeoutMs = 2_000,
  ) {
    const notificationModel = this.getModel<HydratedDocument<unknown>>(
      Notification.name,
    );
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const count = await notificationModel
        .countDocuments({
          userId: new Types.ObjectId(userId),
          type: 'DOCTOR_STATUS_CHANGE',
        })
        .exec();

      if (count === expectedCount) {
        return;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
    }

    throw new Error(
      `Timed out waiting for ${expectedCount} notifications for user ${userId}`,
    );
  }

  async close() {
    if (this.isClosing) {
      return;
    }

    this.isClosing = true;
    const errors: unknown[] = [];

    try {
      if (this.app) {
        await this.app.close();
      }
    } catch (error) {
      errors.push(error);
    }

    try {
      if (
        this.connection &&
        this.connection.readyState !== ConnectionStates.disconnected
      ) {
        await this.connection.close(true);
      }
    } catch (error) {
      errors.push(error);
    }

    try {
      if (this.mongoServer) {
        await this.mongoServer.stop({ doCleanup: true, force: true });
      }
    } catch (error) {
      errors.push(error);
    }

    for (const [key, value] of Object.entries(this.originalEnv)) {
      if (value === undefined) {
        Reflect.deleteProperty(process.env, key);
      } else {
        process.env[key] = value;
      }
    }

    jest.restoreAllMocks();

    this.app = undefined;
    this.connection = undefined;
    this.mongoServer = undefined;
    this.isClosing = false;

    if (errors.length > 0) {
      throw errors[0];
    }
  }

  private async bootstrap(options: E2eEnvironmentOptions) {
    try {
      jest
        .spyOn(ThrottlerGuard.prototype, 'canActivate')
        .mockResolvedValue(true);
      this.mongoServer = await MongoMemoryReplSet.create({
        replSet: { count: 1 },
      });

      this.applyEnvironment(options);

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { AppModule } = require('../../../src/app.module') as {
        AppModule: typeof import('../../../src/app.module').AppModule;
      };

      let builder: TestingModuleBuilder = Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideGuard(ThrottlerGuard)
        .useValue({ canActivate: jest.fn().mockResolvedValue(true) });

      if (options.aiOverride) {
        builder = builder
          .overrideProvider(AiService)
          .useValue(options.aiOverride);
      }

      const moduleFixture = await builder.compile();
      this.app = moduleFixture.createNestApplication();
      this.app.setGlobalPrefix('v1');
      this.app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
          transformOptions: { enableImplicitConversion: true },
        }),
      );
      this.app.useGlobalFilters(new HttpExceptionFilter());
      await this.app.init();

      this.connection = this.app.get<Connection>(getConnectionToken());
    } catch (error) {
      await this.close().catch(() => undefined);
      throw error;
    }
  }

  private applyEnvironment(options: E2eEnvironmentOptions) {
    process.env.NODE_ENV = 'test';
    process.env.DOTENV_CONFIG_PATH = 'test/.env.does-not-exist';
    process.env.MONGODB_URI = this.mongoServer!.getUri();
    process.env.JWT_SECRET = `test-secret-${uniqueValue('jwt')}-12345678901234567890`;
    process.env.JWT_ACCESS_EXPIRES_IN = '1h';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    process.env.ENABLE_BOOTSTRAP_ADMIN = 'false';
    process.env.AI_ENABLED = options.aiEnabled ? 'true' : 'false';
    process.env.AI_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = options.aiEnabled ? 'mock-key' : '';
    process.env.GEMINI_MODEL = options.aiEnabled ? 'mock-model' : '';
    process.env.REDIS_URL = '';
    process.env.REDIS_KEY_PREFIX = `salud-de-una-e2e-${uniqueValue('redis')}`;
    process.env.OUTBOX_DISPATCH_INTERVAL_MS = '50';

    for (const [key, value] of Object.entries(options.env ?? {})) {
      process.env[key] = value;
    }
  }
}
