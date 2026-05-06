import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class SummaryFeedbackDto {
  @IsIn(['USEFUL', 'PARTIALLY_USEFUL', 'NOT_USEFUL'])
  value!: 'USEFUL' | 'PARTIALLY_USEFUL' | 'NOT_USEFUL';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
