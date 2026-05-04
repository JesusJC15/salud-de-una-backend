import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Consultation,
  ConsultationSchema,
} from '../consultations/schemas/consultation.schema';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import {
  ConsultationMessage,
  ConsultationMessageSchema,
} from './schemas/consultation-message.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ConsultationMessage.name, schema: ConsultationMessageSchema },
      { name: Consultation.name, schema: ConsultationSchema },
    ]),
  ],
  providers: [ChatGateway, ChatService],
  exports: [ChatService, MongooseModule],
})
export class ChatModule {}
