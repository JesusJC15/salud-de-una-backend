import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NextFunction, Request, Response } from 'express';
import { connection } from 'mongoose';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

function sanitizeMongoUri(uri?: string): string {
  if (!uri) {
    return 'not configured';
  }

  return uri.replace(/:\/\/([^:@]+):([^@]+)@/u, '://$1:***@');
}

function parseCorsOrigins(
  patientOrigins: string[] = [],
  staffOrigins: string[] = [],
): string[] {
  return [...new Set([...patientOrigins, ...staffOrigins])];
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const globalPrefix = 'v1';
  const port = Number(process.env.PORT ?? 3000);
  const nodeEnv = configService.get<string>('NODE_ENV') ?? 'development';
  const databaseUri = configService.get<string>('database.uri');

  connection.on('connected', () => {
    logger.log('MongoDB connection established successfully');
  });

  connection.on('error', (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`MongoDB connection error: ${message}`);
  });

  connection.on('disconnected', () => {
    logger.warn('MongoDB connection disconnected');
  });

  if (Number(connection.readyState) === 1) {
    logger.log('MongoDB connection is ready');
  }

  app.setGlobalPrefix(globalPrefix);
  const corsOrigins = parseCorsOrigins(
    configService.get<string[]>('web.corsOriginsPatient') ?? [],
    configService.get<string[]>('web.corsOriginsStaff') ?? [],
  );

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || corsOrigins.length === 0 || corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token'],
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
void bootstrap();
