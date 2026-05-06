import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { Specialty } from '../../common/enums/specialty.enum';

export class AdminConsultationReportQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsEnum(Specialty)
  specialty?: Specialty;

  @IsOptional()
  @IsEnum(['LOW', 'MODERATE', 'HIGH'])
  priority?: 'LOW' | 'MODERATE' | 'HIGH';
}
