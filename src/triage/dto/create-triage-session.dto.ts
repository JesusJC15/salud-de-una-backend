import { IsEnum } from 'class-validator';
import { Specialty } from '../../common/enums/specialty.enum';

export class CreateTriageSessionDto {
  @IsEnum(Specialty)
  specialty!: Specialty;
}
