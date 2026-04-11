import { IsEnum, IsOptional } from 'class-validator';
import { Specialty } from '../../common/enums/specialty.enum';

export class GetActiveTriageSessionsDto {
  @IsOptional()
  @IsEnum(Specialty)
  specialty?: Specialty;
}
