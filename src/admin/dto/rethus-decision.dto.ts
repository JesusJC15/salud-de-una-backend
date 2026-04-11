import { IsEnum, IsOptional, IsString, IsUrl } from 'class-validator';

export enum RethusDecisionAction {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
}

export class RethusDecisionDto {
  @IsEnum(RethusDecisionAction)
  action!: RethusDecisionAction;

  @IsOptional()
  @IsUrl()
  evidenceUrl?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
