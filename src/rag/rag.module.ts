import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiModule } from '../ai/ai.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import {
  KnowledgeChunk,
  KnowledgeChunkSchema,
} from '../knowledge/schemas/knowledge-chunk.schema';
import { RagController } from './rag.controller';
import { RagService } from './rag.service';
import { RagFeedback, RagFeedbackSchema } from './schemas/rag-feedback.schema';
import { RagTrace, RagTraceSchema } from './schemas/rag-trace.schema';

@Module({
  imports: [
    AiModule,
    KnowledgeModule,
    MongooseModule.forFeature([
      { name: KnowledgeChunk.name, schema: KnowledgeChunkSchema },
      { name: RagTrace.name, schema: RagTraceSchema },
      { name: RagFeedback.name, schema: RagFeedbackSchema },
    ]),
  ],
  controllers: [RagController],
  providers: [RagService],
  exports: [RagService],
})
export class RagModule {}
