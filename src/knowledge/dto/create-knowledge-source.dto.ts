import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';
import { KNOWLEDGE_SOURCE_TYPES } from '../knowledge.constants';

export class CreateKnowledgeSourceDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  authority!: string;

  @IsString()
  @IsIn(KNOWLEDGE_SOURCE_TYPES)
  sourceType!: (typeof KNOWLEDGE_SOURCE_TYPES)[number];

  @IsOptional()
  @IsUrl({ require_tld: false })
  baseUrl?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsBoolean()
  allowUrlIngest?: boolean;

  @IsOptional()
  @IsBoolean()
  isGlobalFallback?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  authorityWeight?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
