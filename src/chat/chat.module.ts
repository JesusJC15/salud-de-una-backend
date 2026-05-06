import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import {
  Consultation,
  ConsultationSchema,
} from '../consultations/schemas/consultation.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import {
  ConsultationMessage,
  ConsultationMessageSchema,
} from './schemas/consultation-message.schema';

@Module({
  imports: [
    AuthModule,
    NotificationsModule,
    MongooseModule.forFeature([
      { name: Consultation.name, schema: ConsultationSchema },
      {
        name: ConsultationMessage.name,
        schema: ConsultationMessageSchema,
      },
    ]),
  ],
  providers: [ChatGateway, ChatService],
  exports: [ChatService],
})
export class ChatModule {}
