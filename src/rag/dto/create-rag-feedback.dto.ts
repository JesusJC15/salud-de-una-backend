import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateRagFeedbackDto {
  @IsString()
  traceId!: string;

  @IsOptional()
  @IsString()
  consultationId?: string;

  @IsBoolean()
  useful!: boolean;

  @IsBoolean()
  grounded!: boolean;

  @IsOptional()
  @IsString()
  comment?: string;
}
