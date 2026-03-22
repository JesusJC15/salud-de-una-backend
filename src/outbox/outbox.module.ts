import { Module } from '@nestjs/common';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  DOMAIN_EVENTS_QUEUE,
  DOMAIN_EVENTS_QUEUE_NAME,
} from './outbox.constants';
import { DomainEventsHandlerService } from './domain-events-handler.service';
import { DomainEventsProcessor } from './domain-events.processor';
import { OutboxDispatcherService } from './outbox-dispatcher.service';
import { OutboxService } from './outbox.service';
import { OutboxEvent, OutboxEventSchema } from './schemas/outbox-event.schema';

const bullQueueImports = process.env.REDIS_URL
  ? [
      BullModule.registerQueueAsync({
        name: DOMAIN_EVENTS_QUEUE_NAME,
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          name: DOMAIN_EVENTS_QUEUE_NAME,
          prefix: `${configService.get<string>('redis.keyPrefix') ?? 'salud-de-una'}:bull`,
        }),
      }),
    ]
  : [];

@Module({
  imports: [
    NotificationsModule,
    MongooseModule.forFeature([
      { name: OutboxEvent.name, schema: OutboxEventSchema },
    ]),
    ...bullQueueImports,
  ],
  providers: [
    {
      provide: DOMAIN_EVENTS_QUEUE,
      useFactory: (queue?: Queue) => queue ?? null,
      inject: process.env.REDIS_URL
        ? [getQueueToken(DOMAIN_EVENTS_QUEUE_NAME)]
        : [],
    },
    OutboxService,
    DomainEventsHandlerService,
    OutboxDispatcherService,
    DomainEventsProcessor,
  ],
  exports: [OutboxService, OutboxDispatcherService],
})
export class OutboxModule {}
