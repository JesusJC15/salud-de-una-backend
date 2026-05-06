import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SubmitFollowupDto {
  @IsString()
  followupId!: string;

  @IsInt()
  @Min(1)
  @Max(10)
  currentSymptomSeverity!: number;

  @IsEnum(['BETTER', 'SAME', 'WORSE'])
  change!: 'BETTER' | 'SAME' | 'WORSE';

  @IsBoolean()
  medicationTaken!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  medicationNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  newSymptoms?: string;
}
