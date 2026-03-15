import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
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

describe('main bootstrap', () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

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
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
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
    const connection = {
      readyState: 0,
      asPromise: jest.fn().mockResolvedValue({}),
    } as unknown as Connection;

    await expect(
      waitForDatabaseConnection(connection, logger),
    ).resolves.toBeUndefined();
    expect(connection.asPromise).toHaveBeenCalled();
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
    const app = {
      get: jest.fn(),
      setGlobalPrefix: jest.fn(),
      enableCors: jest.fn(),
      use: jest.fn(),
      useGlobalPipes: jest.fn(),
      useGlobalFilters: jest.fn(),
      listen: jest.fn().mockResolvedValue(undefined),
    };
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'NODE_ENV') return 'test';
        if (key === 'database.uri')
          return 'mongodb://user:pass@localhost:27017/db';
        if (key === 'web.corsOriginsPatient') return ['http://patient.local'];
        if (key === 'web.corsOriginsStaff') return [];
        return undefined;
      }),
    };
    const dbConnection = {
      readyState: 1,
      on: jest.fn((event: string, handler: (value?: unknown) => void) => {
        handlers[event] = handler;
      }),
    };
    app.get.mockImplementation((token: unknown) => {
      if (
        token === ConfigService ||
        (token as { name?: string })?.name === 'ConfigService'
      ) {
        return configService;
      }
      if (token === getConnectionToken()) return dbConnection;
      return undefined;
    });

    (NestFactory.create as jest.Mock).mockResolvedValue(app);
    process.env.PORT = '4001';

    await expect(bootstrap()).resolves.toBeUndefined();

    expect(app.setGlobalPrefix).toHaveBeenCalledWith('v1');
    expect(app.enableCors).toHaveBeenCalled();
    expect(app.listen).toHaveBeenCalledWith(4001);

    const corsOptions = app.enableCors.mock.calls[0][0];
    const allowCb = jest.fn();
    corsOptions.origin('http://patient.local', allowCb);
    expect(allowCb).toHaveBeenCalledWith(null, true);

    const denyCb = jest.fn();
    corsOptions.origin('http://evil.local', denyCb);
    expect(denyCb).toHaveBeenCalledWith(null, false);

    const emptyCb = jest.fn();
    corsOptions.origin(undefined, emptyCb);
    expect(emptyCb).toHaveBeenCalledWith(null, true);

    handlers.connected?.();
    handlers.error?.('db-error');
    handlers.error?.(new Error('db-error'));
    handlers.disconnected?.();

    const middleware = app.use.mock.calls[0][0];
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
    const app = {
      get: jest.fn(),
      setGlobalPrefix: jest.fn(),
      enableCors: jest.fn(),
      use: jest.fn(),
      useGlobalPipes: jest.fn(),
      useGlobalFilters: jest.fn(),
      listen: jest.fn().mockResolvedValue(undefined),
    };
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'NODE_ENV') return 'development';
        if (key === 'database.uri') return 'mongodb://localhost:27017/db';
        if (key === 'web.corsOriginsPatient') return [];
        if (key === 'web.corsOriginsStaff') return [];
        return undefined;
      }),
    };
    const dbConnection = {
      readyState: 1,
      on: jest.fn(),
    };
    app.get.mockImplementation((token: unknown) => {
      if (
        token === ConfigService ||
        (token as { name?: string })?.name === 'ConfigService'
      ) {
        return configService;
      }
      if (token === getConnectionToken()) return dbConnection;
      return undefined;
    });

    (NestFactory.create as jest.Mock).mockResolvedValue(app);
    await expect(bootstrap()).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('bootstrap should throw in production when no CORS origins', async () => {
    const app = {
      get: jest.fn(),
      setGlobalPrefix: jest.fn(),
      enableCors: jest.fn(),
      use: jest.fn(),
      useGlobalPipes: jest.fn(),
      useGlobalFilters: jest.fn(),
      listen: jest.fn().mockResolvedValue(undefined),
    };
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'NODE_ENV') return 'production';
        if (key === 'database.uri') return 'mongodb://localhost:27017/db';
        if (key === 'web.corsOriginsPatient') return [];
        if (key === 'web.corsOriginsStaff') return [];
        return undefined;
      }),
    };
    const dbConnection = {
      readyState: 1,
      on: jest.fn(),
    };
    app.get.mockImplementation((token: unknown) => {
      if (
        token === ConfigService ||
        (token as { name?: string })?.name === 'ConfigService'
      ) {
        return configService;
      }
      if (token === getConnectionToken()) return dbConnection;
      return undefined;
    });

    (NestFactory.create as jest.Mock).mockResolvedValue(app);
    await expect(bootstrap()).rejects.toThrow(/No CORS origins configured/);
  });

  it('bootstrap should use default nodeEnv when missing', async () => {
    const app = {
      get: jest.fn(),
      setGlobalPrefix: jest.fn(),
      enableCors: jest.fn(),
      use: jest.fn(),
      useGlobalPipes: jest.fn(),
      useGlobalFilters: jest.fn(),
      listen: jest.fn().mockResolvedValue(undefined),
    };
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'database.uri') return 'mongodb://localhost:27017/db';
        return undefined;
      }),
    };
    const dbConnection = {
      readyState: 1,
      on: jest.fn(),
    };
    app.get.mockImplementation((token: unknown) => {
      if (
        token === ConfigService ||
        (token as { name?: string })?.name === 'ConfigService'
      ) {
        return configService;
      }
      return dbConnection;
    });

    (NestFactory.create as jest.Mock).mockResolvedValue(app);
    await expect(bootstrap()).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('should auto-bootstrap when NODE_ENV is not test', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const app = {
      get: jest.fn(),
      setGlobalPrefix: jest.fn(),
      enableCors: jest.fn(),
      use: jest.fn(),
      useGlobalPipes: jest.fn(),
      useGlobalFilters: jest.fn(),
      listen: jest.fn().mockResolvedValue(undefined),
    };
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'NODE_ENV') return 'development';
        if (key === 'database.uri') return 'mongodb://localhost:27017/db';
        if (key === 'web.corsOriginsPatient') return ['http://patient.local'];
        if (key === 'web.corsOriginsStaff') return [];
        return undefined;
      }),
    };
    const dbConnection = {
      readyState: 1,
      on: jest.fn(),
    };
    app.get.mockImplementation((token: unknown) => {
      if (
        token === ConfigService ||
        (token as { name?: string })?.name === 'ConfigService'
      ) {
        return configService;
      }
      return dbConnection;
    });

    (NestFactory.create as jest.Mock).mockResolvedValue(app);

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('./main');
    });

    process.env.NODE_ENV = originalEnv;
  });
});
