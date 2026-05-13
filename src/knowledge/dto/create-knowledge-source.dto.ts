import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { KNOWLEDGE_SOURCE_TYPES } from '../knowledge.constants';

export class CreateKnowledgeSourceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  authority!: string;

  @IsString()
  @IsIn(KNOWLEDGE_SOURCE_TYPES)
  sourceType!: (typeof KNOWLEDGE_SOURCE_TYPES)[number];

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2000)
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
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
  @MaxLength(2000)
  notes?: string;
}
