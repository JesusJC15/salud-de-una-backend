import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiModule } from '../ai/ai.module';
import { ConsultationsModule } from '../consultations/consultations.module';
import { TriageController } from './triage.controller';
import { TriageQuestionsRepository } from './questions/triage-questions.repository';
import {
  TriageSession,
  TriageSessionSchema,
} from './schemas/triage-session.schema';
import { GeminiTriageService } from './services/gemini-triage.service';
import { GuardrailService } from './services/guardrail.service';
import { TriageService } from './triage.service';

@Module({
  imports: [
    AiModule,
    ConsultationsModule,
    MongooseModule.forFeature([
      { name: TriageSession.name, schema: TriageSessionSchema },
    ]),
  ],
  controllers: [TriageController],
  providers: [
    TriageService,
    TriageQuestionsRepository,
    GuardrailService,
    GeminiTriageService,
  ],
  exports: [TriageService, TriageQuestionsRepository, MongooseModule],
})
export class TriageModule {}
