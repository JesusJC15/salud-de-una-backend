import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { Specialty } from '../../common/enums/specialty.enum';
import {
  KNOWLEDGE_AUDIENCES,
  KNOWLEDGE_SOURCE_TYPES,
  KNOWLEDGE_USE_CASES,
} from '../knowledge.constants';

export class IngestDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(24)
  sourceId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  authority!: string;

  @IsString()
  @IsIn(KNOWLEDGE_SOURCE_TYPES)
  sourceType!: (typeof KNOWLEDGE_SOURCE_TYPES)[number];

  @IsString()
  @IsIn(Object.values(Specialty))
  specialty!: Specialty;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  clinicalTags?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  symptoms?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  redFlags?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  drugNames?: string;

  @IsOptional()
  @IsString()
  @IsIn(KNOWLEDGE_AUDIENCES)
  audience?: (typeof KNOWLEDGE_AUDIENCES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  useCases?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  language?: string;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  contentText?: string;
}

export class IngestDocumentUrlDto extends IngestDocumentDto {
  @IsUrl({ require_tld: false })
  @MaxLength(2000)
  sourceUrl!: string;
}

export const KNOWLEDGE_USE_CASE_VALUES = KNOWLEDGE_USE_CASES;
