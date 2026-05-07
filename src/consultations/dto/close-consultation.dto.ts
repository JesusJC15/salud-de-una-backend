import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class CloseConsultationDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  baselineSymptomSeverity?: number;

  @IsOptional()
  @IsBoolean()
  redFlagsConfirmed?: boolean;
}
