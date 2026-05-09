import { IsIn, IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';
import { Specialty } from '../../common/enums/specialty.enum';
import {
  KNOWLEDGE_AUDIENCES,
  KNOWLEDGE_SOURCE_TYPES,
  KNOWLEDGE_USE_CASES,
} from '../knowledge.constants';

export class IngestDocumentDto {
  @IsOptional()
  @IsString()
  sourceId?: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  authority!: string;

  @IsString()
  @IsIn(KNOWLEDGE_SOURCE_TYPES)
  sourceType!: (typeof KNOWLEDGE_SOURCE_TYPES)[number];

  @IsString()
  @IsIn(Object.values(Specialty))
  specialty!: Specialty;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  clinicalTags?: string;

  @IsOptional()
  @IsString()
  symptoms?: string;

  @IsOptional()
  @IsString()
  redFlags?: string;

  @IsOptional()
  @IsString()
  drugNames?: string;

  @IsOptional()
  @IsString()
  @IsIn(KNOWLEDGE_AUDIENCES)
  audience?: (typeof KNOWLEDGE_AUDIENCES)[number];

  @IsOptional()
  @IsString()
  useCases?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  validFrom?: string;

  @IsOptional()
  @IsString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  contentText?: string;
}

export class IngestDocumentUrlDto extends IngestDocumentDto {
  @IsUrl({ require_tld: false })
  sourceUrl!: string;
}

export const KNOWLEDGE_USE_CASE_VALUES = KNOWLEDGE_USE_CASES;
