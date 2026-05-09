import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiModule } from '../ai/ai.module';
import { ConsultationsModule } from '../consultations/consultations.module';
import { RagModule } from '../rag/rag.module';
import { TriageController } from './triage.controller';
import { TriageQuestionsRepository } from './questions/triage-questions.repository';
import {
  TriageSession,
  TriageSessionSchema,
} from './schemas/triage-session.schema';
import {
  TriageQuestionSet,
  TriageQuestionSetSchema,
} from './schemas/triage-question-set.schema';
import { GeminiTriageService } from './services/gemini-triage.service';
import { GuardrailService } from './services/guardrail.service';
import { TriageService } from './triage.service';
import { TriageQuestionsSeederService } from './triage-questions-seeder.service';

@Module({
  imports: [
    AiModule,
    ConsultationsModule,
    RagModule,
    MongooseModule.forFeature([
      { name: TriageSession.name, schema: TriageSessionSchema },
      { name: TriageQuestionSet.name, schema: TriageQuestionSetSchema },
    ]),
  ],
  controllers: [TriageController],
  providers: [
    TriageService,
    TriageQuestionsRepository,
    TriageQuestionsSeederService,
    GuardrailService,
    GeminiTriageService,
  ],
  exports: [TriageService, TriageQuestionsRepository, MongooseModule],
})
export class TriageModule {}
