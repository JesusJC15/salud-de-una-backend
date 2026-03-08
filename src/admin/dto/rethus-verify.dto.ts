import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';
import { ProgramType } from '../../common/enums/program-type.enum';
import { RethusState } from '../../common/enums/rethus-state.enum';
import { TitleObtainingOrigin } from '../../common/enums/title-obtaining-origin.enum';

export class RethusVerifyDto {
  @IsEnum(ProgramType)
  programType!: ProgramType;

  @IsEnum(TitleObtainingOrigin)
  titleObtainingOrigin!: TitleObtainingOrigin;

  @IsString()
  professionOccupation!: string;

  @IsDateString()
  startDate!: string;

  @IsEnum(RethusState)
  rethusState!: RethusState;

  @IsString()
  administrativeAct!: string;

  @IsString()
  reportingEntity!: string;

  @IsOptional()
  @IsUrl()
  evidenceUrl?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
