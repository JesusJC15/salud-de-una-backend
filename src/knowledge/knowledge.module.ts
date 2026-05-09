import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiModule } from '../ai/ai.module';
import { Doctor, DoctorSchema } from '../doctors/schemas/doctor.schema';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeStorageService } from './knowledge-storage.service';
import {
  KnowledgeChunk,
  KnowledgeChunkSchema,
} from './schemas/knowledge-chunk.schema';
import {
  KnowledgeDocument,
  KnowledgeDocumentSchema,
} from './schemas/knowledge-document.schema';
import {
  KnowledgeDocumentVersion,
  KnowledgeDocumentVersionSchema,
} from './schemas/knowledge-document-version.schema';
import {
  KnowledgeJob,
  KnowledgeJobSchema,
} from './schemas/knowledge-job.schema';
import {
  KnowledgeReview,
  KnowledgeReviewSchema,
} from './schemas/knowledge-review.schema';
import {
  KnowledgeSource,
  KnowledgeSourceSchema,
} from './schemas/knowledge-source.schema';

@Module({
  imports: [
    AiModule,
    MongooseModule.forFeature([
      { name: Doctor.name, schema: DoctorSchema },
      { name: KnowledgeSource.name, schema: KnowledgeSourceSchema },
      { name: KnowledgeDocument.name, schema: KnowledgeDocumentSchema },
      {
        name: KnowledgeDocumentVersion.name,
        schema: KnowledgeDocumentVersionSchema,
      },
      { name: KnowledgeChunk.name, schema: KnowledgeChunkSchema },
      { name: KnowledgeReview.name, schema: KnowledgeReviewSchema },
      { name: KnowledgeJob.name, schema: KnowledgeJobSchema },
    ]),
  ],
  controllers: [KnowledgeController],
  providers: [KnowledgeStorageService, KnowledgeService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
