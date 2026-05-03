import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import { SwaggerModule } from '@nestjs/swagger';
import type { Connection } from 'mongoose';
import {
  bootstrap,
  parseCorsOrigins,
  sanitizeMongoUri,
  waitForDatabaseConnection,
} from './main';

jest.mock('@nestjs/core', () => ({
  NestFactory: {
    create: jest.fn(),
  },
}));

jest.mock('@nestjs/platform-socket.io', () => ({
  IoAdapter: jest.fn().mockImplementation(() => ({})),
}));

type ConfigValue = string | string[] | undefined;
type CorsOriginCallback = (err: Error | null, allow?: boolean) => void;
type CorsOptions = {
  origin: (origin: string | undefined, callback: CorsOriginCallback) => void;
  credentials: boolean;
  methods: string[];
  allowedHeaders: string[];
  exposedHeaders: string[];
};
type SecurityMiddleware = (
  req: unknown,
  res: { setHeader: (name: string, value: string) => void },
  next: () => void,
) => void;
type AppMock = {
  get: jest.Mock<unknown, [unknown]>;
  setGlobalPrefix: jest.Mock<void, [string]>;
  enableCors: jest.Mock<void, [CorsOptions]>;
  use: jest.Mock<void, [SecurityMiddleware]>;
  useGlobalPipes: jest.Mock<void, [unknown]>;
  useGlobalFilters: jest.Mock<void, [unknown]>;
  useWebSocketAdapter: jest.Mock;
  listen: jest.Mock<Promise<void>, [number]>;
};
type ConfigServiceMock = {
  get: jest.Mock<ConfigValue, [string]>;
};
type DbHandler = (value?: unknown) => void;
type DbConnectionMock = {
  readyState: number;
  on: jest.Mock<void, [string, DbHandler]>;
};

function createBootstrapContext(
  configValues: Record<string, ConfigValue>,
  handlers?: Record<string, DbHandler>,
): {
  app: AppMock;
  configService: ConfigServiceMock;
  dbConnection: DbConnectionMock;
} {
  const app: AppMock = {
    get: jest.fn<unknown, [unknown]>(),
    setGlobalPrefix: jest.fn<void, [string]>(),
    enableCors: jest.fn<void, [CorsOptions]>(),
    use: jest.fn<void, [SecurityMiddleware]>(),
    useGlobalPipes: jest.fn<void, [unknown]>(),
    useGlobalFilters: jest.fn<void, [unknown]>(),
    useWebSocketAdapter: jest.fn(),
    listen: jest.fn<Promise<void>, [number]>().mockResolvedValue(undefined),
  };
  const configService: ConfigServiceMock = {
    get: jest.fn<ConfigValue, [string]>((key: string) => configValues[key]),
  };
  const dbConnection: DbConnectionMock = {
    readyState: 1,
    on: jest.fn<void, [string, DbHandler]>(
      (event: string, handler: DbHandler) => {
        if (handlers) {
          handlers[event] = handler;
        }
      },
    ),
  };

  app.get.mockImplementation((token: unknown): unknown => {
    if (
      token === ConfigService ||
      (typeof token === 'function' && token.name === 'ConfigService')
    ) {
      return configService;
    }

    if (token === getConnectionToken()) {
      return dbConnection;
    }

    return undefined;
  });

  return { app, configService, dbConnection };
}

describe('main bootstrap', () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  let swaggerCreateSpy: jest.SpyInstance;
  let swaggerSetupSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    swaggerCreateSpy = jest
      .spyOn(SwaggerModule, 'createDocument')
      .mockReturnValue({} as never);
    swaggerSetupSpy = jest
      .spyOn(SwaggerModule, 'setup')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    swaggerCreateSpy.mockRestore();
    swaggerSetupSpy.mockRestore();
    jest.clearAllMocks();
  });

  it('sanitizeMongoUri should mask credentials and handle empty', () => {
    expect(sanitizeMongoUri()).toBe('not configured');
    expect(sanitizeMongoUri('mongodb://user:pass@localhost:27017/db')).toBe(
      'mongodb://user:***@localhost:27017/db',
    );
  });

  it('parseCorsOrigins should merge and dedupe', () => {
    const result = parseCorsOrigins(
      ['http://a.com', 'http://b.com'],
      ['http://a.com', 'http://c.com'],
    );
    expect(result).toEqual(['http://a.com', 'http://b.com', 'http://c.com']);
  });

  it('parseCorsOrigins should handle empty input', () => {
    expect(parseCorsOrigins()).toEqual([]);
  });

  it('waitForDatabaseConnection should return when ready', async () => {
    const logger = new Logger('Test');
    const connection = { readyState: 1 } as Connection;
    await expect(
      waitForDatabaseConnection(connection, logger),
    ).resolves.toBeUndefined();
  });

  it('waitForDatabaseConnection should resolve once connection is ready', async () => {
    const logger = new Logger('Test');
    const asPromise = jest.fn().mockResolvedValue({});
    const connection = {
      readyState: 0,
      asPromise,
    } as unknown as Connection;

    await expect(
      waitForDatabaseConnection(connection, logger),
    ).resolves.toBeUndefined();
    expect(asPromise).toHaveBeenCalled();
  });

  it('waitForDatabaseConnection should exit on timeout/error', async () => {
    const logger = new Logger('Test');
    const connection = {
      readyState: 0,
      asPromise: jest.fn().mockRejectedValue('boom'),
    } as unknown as Connection;
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);

    await expect(waitForDatabaseConnection(connection, logger)).rejects.toThrow(
      'exit',
    );
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });

  it('waitForDatabaseConnection should timeout when connection hangs', async () => {
    jest.useFakeTimers();
    const logger = new Logger('Test');
    const connection = {
      readyState: 0,
      asPromise: jest.fn(() => new Promise(() => undefined)),
    } as unknown as Connection;
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);

    const promise = waitForDatabaseConnection(connection, logger);
    jest.advanceTimersByTime(30_000);

    await expect(promise).rejects.toThrow('exit');
    exitSpy.mockRestore();
    jest.useRealTimers();
  });

  it('bootstrap should configure app with CORS when origins exist', async () => {
    const handlers: Record<string, (value?: unknown) => void> = {};
    const { app } = createBootstrapContext(
      {
        NODE_ENV: 'test',
        'database.uri': 'mongodb://user:pass@localhost:27017/db',
        'web.corsOriginsPatient': ['http://patient.local'],
        'web.corsOriginsStaff': [],
      },
      handlers,
    );

    (
      NestFactory.create as jest.MockedFunction<typeof NestFactory.create>
    ).mockResolvedValue(app as never);
    process.env.PORT = '4001';

    await expect(bootstrap()).resolves.toBeUndefined();

    expect(app.setGlobalPrefix).toHaveBeenCalledWith('v1');
    expect(app.enableCors).toHaveBeenCalled();
    expect(app.listen).toHaveBeenCalledWith(4001);

    const [corsOptions] = app.enableCors.mock.calls[0];
    const allowCb = jest.fn<void, [Error | null, boolean?]>();
    corsOptions.origin('http://patient.local', allowCb);
    expect(allowCb).toHaveBeenCalledWith(null, true);

    const denyCb = jest.fn<void, [Error | null, boolean?]>();
    corsOptions.origin('http://evil.local', denyCb);
    expect(denyCb).toHaveBeenCalledWith(null, false);

    const emptyCb = jest.fn<void, [Error | null, boolean?]>();
    corsOptions.origin(undefined, emptyCb);
    expect(emptyCb).toHaveBeenCalledWith(null, true);

    handlers.connected?.();
    handlers.error?.('db-error');
    handlers.error?.(new Error('db-error'));
    handlers.disconnected?.();

    const [middleware] = app.use.mock.calls[0];
    const res = { setHeader: jest.fn() };
    const next = jest.fn();
    middleware({} as unknown, res as unknown, next);
    expect(res.setHeader).toHaveBeenCalledWith(
      'X-Content-Type-Options',
      'nosniff',
    );
    expect(next).toHaveBeenCalled();
  });

  it('bootstrap should warn when no origins in non-test env', async () => {
    const { app } = createBootstrapContext({
      NODE_ENV: 'development',
      'database.uri': 'mongodb://localhost:27017/db',
      'web.corsOriginsPatient': [],
      'web.corsOriginsStaff': [],
    });

    (
      NestFactory.create as jest.MockedFunction<typeof NestFactory.create>
    ).mockResolvedValue(app as never);
    await expect(bootstrap()).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('bootstrap should throw in production when no CORS origins', async () => {
    const { app } = createBootstrapContext({
      NODE_ENV: 'production',
      'database.uri': 'mongodb://localhost:27017/db',
      'web.corsOriginsPatient': [],
      'web.corsOriginsStaff': [],
    });

    (
      NestFactory.create as jest.MockedFunction<typeof NestFactory.create>
    ).mockResolvedValue(app as never);
    await expect(bootstrap()).rejects.toThrow(/No CORS origins configured/);
  });

  it('bootstrap should use default nodeEnv when missing', async () => {
    const { app } = createBootstrapContext({
      'database.uri': 'mongodb://localhost:27017/db',
    });

    (
      NestFactory.create as jest.MockedFunction<typeof NestFactory.create>
    ).mockResolvedValue(app as never);
    await expect(bootstrap()).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('should auto-bootstrap when NODE_ENV is not test', () => {
    const originalEnv = process.env.NODE_ENV;
    const { app } = createBootstrapContext({
      NODE_ENV: 'development',
      'database.uri': 'mongodb://localhost:27017/db',
      'web.corsOriginsPatient': ['http://patient.local'],
      'web.corsOriginsStaff': [],
    });

    process.env.NODE_ENV = 'development';
    (
      NestFactory.create as jest.MockedFunction<typeof NestFactory.create>
    ).mockResolvedValue(app as never);

    try {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('./main');
      });
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
