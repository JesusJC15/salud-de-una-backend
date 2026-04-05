import 'dotenv/config';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import type { ConnectionOptions } from 'bullmq';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AdminsModule } from './admins/admins.module';
import { AiModule } from './ai/ai.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor';
import aiConfig from './config/ai.config';
import authConfig from './config/auth.config';
import databaseConfig from './config/database.config';
import redisConfig from './config/redis.config';
import { validationSchema } from './config/validation.schema';
import webConfig from './config/web.config';
import { ConsultationsModule } from './consultations/consultations.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DoctorsModule } from './doctors/doctors.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OutboxModule } from './outbox/outbox.module';
import { PatientsModule } from './patients/patients.module';
import { TriageModule } from './triage/triage.module';
import {
  REDIS_CLIENT,
  REDIS_CONNECTION_OPTIONS,
} from './redis/redis.constants';
import { RedisModule } from './redis/redis.module';
import { RedisHealthService } from './redis/redis-health.service';
import { RedisThrottlerStorage } from './redis/redis-throttler.storage';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [aiConfig, authConfig, databaseConfig, redisConfig, webConfig],
      validationSchema,
      validationOptions: {
        abortEarly: true,
        allowUnknown: true,
      },
    }),
    RedisModule,
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [RedisHealthService, REDIS_CLIENT],
      useFactory: (
        redisHealthService: RedisHealthService,
        redisClient: unknown,
      ) => ({
        throttlers: [
          {
            ttl: 60,
            limit: 20,
          },
        ],
        storage: new RedisThrottlerStorage(
          redisHealthService,
          redisClient as ConstructorParameters<typeof RedisThrottlerStorage>[1],
        ),
      }),
    }),
    BullModule.forRootAsync({
      imports: [RedisModule],
      inject: [ConfigService, REDIS_CONNECTION_OPTIONS],
      useFactory: (
        configService: ConfigService,
        connectionOptions: ConnectionOptions | null,
      ) => {
        const resolvedConnection: ConnectionOptions = connectionOptions ?? {
          host: '127.0.0.1',
          port: 6379,
        };

        return {
          connection: resolvedConnection,
          prefix: `${configService.get<string>('redis.keyPrefix') ?? 'salud-de-una'}:bull`,
        };
      },
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('database.uri'),
      }),
    }),
    AiModule,
    AuthModule,
    PatientsModule,
    DoctorsModule,
    AdminModule,
    NotificationsModule,
    DashboardModule,
    ConsultationsModule,
    TriageModule,
    AdminsModule,
    OutboxModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestLoggingInterceptor,
    },
  ],
})
export class AppModule {}
