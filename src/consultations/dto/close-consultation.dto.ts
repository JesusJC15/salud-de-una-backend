import { IsBoolean, IsInt, Max, Min } from 'class-validator';

export class CloseConsultationDto {
  @IsInt()
  @Min(1)
  @Max(10)
  baselineSymptomSeverity!: number;

  @IsBoolean()
  redFlagsConfirmed!: boolean;
}
