import { IsOptional, IsString, IsUrl } from 'class-validator';

export class RethusResubmitDto {
  @IsOptional()
  @IsUrl()
  evidenceUrl?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
