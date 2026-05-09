import { IsIn, IsOptional, IsString } from 'class-validator';
import { KNOWLEDGE_REVIEW_STATUSES } from '../knowledge.constants';

export class ReviewKnowledgeDocumentDto {
  @IsString()
  @IsIn(KNOWLEDGE_REVIEW_STATUSES)
  status!: (typeof KNOWLEDGE_REVIEW_STATUSES)[number];

  @IsOptional()
  @IsString()
  notes?: string;
}
