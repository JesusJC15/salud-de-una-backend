import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ConnectionOptions, Queue } from 'bullmq';
import { NotificationsModule } from '../notifications/notifications.module';
import { REDIS_CONNECTION_OPTIONS } from '../redis/redis.constants';
import {
  DOMAIN_EVENTS_QUEUE,
  DOMAIN_EVENTS_QUEUE_NAME,
} from './outbox.constants';
import { DomainEventsHandlerService } from './domain-events-handler.service';
import { DomainEventsProcessor } from './domain-events.processor';
import { OutboxDispatcherService } from './outbox-dispatcher.service';
import { OutboxService } from './outbox.service';
import { OutboxEvent, OutboxEventSchema } from './schemas/outbox-event.schema';

@Module({
  imports: [
    NotificationsModule,
    MongooseModule.forFeature([
      { name: OutboxEvent.name, schema: OutboxEventSchema },
    ]),
  ],
  providers: [
    {
      provide: DOMAIN_EVENTS_QUEUE,
      useFactory: (
        configService: ConfigService,
        connectionOptions: ConnectionOptions | null,
      ): Queue | null => {
        const redisUrl = configService.get<string>('redis.url');
        if (!redisUrl || !connectionOptions) {
          return null;
        }

        return new Queue(DOMAIN_EVENTS_QUEUE_NAME, {
          connection: connectionOptions,
          prefix: `${configService.get<string>('redis.keyPrefix') ?? 'salud-de-una'}:bull`,
        });
      },
      inject: [ConfigService, REDIS_CONNECTION_OPTIONS],
    },
    OutboxService,
    DomainEventsHandlerService,
    OutboxDispatcherService,
    DomainEventsProcessor,
  ],
  exports: [OutboxService, OutboxDispatcherService],
})
export class OutboxModule {}
