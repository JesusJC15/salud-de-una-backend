import { IsEnum, IsOptional } from 'class-validator';
import { DoctorStatus } from '../../common/enums/doctor-status.enum';
import { Specialty } from '../../common/enums/specialty.enum';
import { PaginationSearchDto } from './pagination-search.dto';

export class ListDoctorsForReviewDto extends PaginationSearchDto {
  @IsOptional()
  @IsEnum(DoctorStatus)
  status?: DoctorStatus;

  @IsOptional()
  @IsEnum(Specialty)
  specialty?: Specialty;
}
