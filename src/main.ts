import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import { NextFunction, Request, Response } from 'express';
import { Connection } from 'mongoose';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { describeReadyState } from './common/utils/mongo-ready-state.util';

export function sanitizeMongoUri(uri?: string): string {
  if (!uri) {
    return 'not configured';
  }

  return uri.replace(/:\/\/([^:@]+):([^@]+)@/u, '://$1:***@');
}

export function parseCorsOrigins(
  patientOrigins: string[] = [],
  staffOrigins: string[] = [],
): string[] {
  return [...new Set([...patientOrigins, ...staffOrigins])];
}

const MONGODB_CONNECT_TIMEOUT_MS = 30_000;

export async function waitForDatabaseConnection(
  dbConnection: Connection,
  logger: Logger,
): Promise<void> {
  const readyState = Number(dbConnection.readyState);

  if (readyState === 1) {
    logger.log('MongoDB connection is ready');
    return;
  }

  logger.log(
    `Waiting for MongoDB connection. Current readyState: ${readyState} (${describeReadyState(readyState)})`,
  );

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () =>
          reject(
            new Error(
              `MongoDB connection timed out after ${MONGODB_CONNECT_TIMEOUT_MS}ms`,
            ),
          ),
        MONGODB_CONNECT_TIMEOUT_MS,
      );
    });
    await Promise.race([
      dbConnection.asPromise().then((conn) => {
        clearTimeout(timeoutHandle);
        return conn;
      }),
      timeout,
    ]);
    logger.log('MongoDB connection is ready');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to establish MongoDB connection: ${message}`);
    process.exit(1);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

export async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const dbConnection = app.get<Connection>(getConnectionToken());
  const globalPrefix = 'v1';
  const port = Number(process.env.PORT ?? 3000);
  const nodeEnv = configService.get<string>('NODE_ENV') ?? 'development';
  const databaseUri = configService.get<string>('database.uri');

  dbConnection.on('connected', () => {
    logger.log('MongoDB connection established successfully');
  });

  dbConnection.on('error', (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`MongoDB connection error: ${message}`);
  });

  dbConnection.on('disconnected', () => {
    logger.warn('MongoDB connection disconnected');
  });

  await waitForDatabaseConnection(dbConnection, logger);

  app.setGlobalPrefix(globalPrefix);
  const corsOrigins = parseCorsOrigins(
    configService.get<string[]>('web.corsOriginsPatient') ?? [],
    configService.get<string[]>('web.corsOriginsStaff') ?? [],
  );

  if (corsOrigins.length === 0 && nodeEnv === 'production') {
    throw new Error(
      'No CORS origins configured. Set CORS_ORIGINS_PATIENT and/or CORS_ORIGINS_STAFF before starting the server.',
    );
  }

  if (corsOrigins.length === 0 && nodeEnv !== 'test') {
    logger.warn(
      'No CORS origins configured. All cross-origin requests will be rejected. Set CORS_ORIGINS_PATIENT and/or CORS_ORIGINS_STAFF to allow specific origins.',
    );
  }

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    credentials: false,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-correlation-id'],
    exposedHeaders: ['x-correlation-id'],
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    void req;
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.listen(port);

  logger.log(`Server started on http://localhost:${port}/${globalPrefix}`);
  logger.log(
    `Health endpoint: http://localhost:${port}/${globalPrefix}/health`,
  );
  logger.log(
    `Readiness endpoint: http://localhost:${port}/${globalPrefix}/ready`,
  );
  logger.log(`Environment: ${nodeEnv} | PID: ${process.pid}`);
  logger.log(`Database URI: ${sanitizeMongoUri(databaseUri)}`);
}
if (process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID) {
  void bootstrap();
}
