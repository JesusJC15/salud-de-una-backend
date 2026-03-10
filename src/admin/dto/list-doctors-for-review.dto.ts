import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { DoctorStatus } from '../../common/enums/doctor-status.enum';
import { Specialty } from '../../common/enums/specialty.enum';

export class ListDoctorsForReviewDto {
  @IsOptional()
  @IsEnum(DoctorStatus)
  status?: DoctorStatus;

  @IsOptional()
  @IsEnum(Specialty)
  specialty?: Specialty;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}
