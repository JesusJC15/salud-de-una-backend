import { IsEnum } from 'class-validator';
import { DoctorAvailability } from '../../common/enums/doctor-availability.enum';

export class UpdateAvailabilityDto {
  @IsEnum(DoctorAvailability)
  status!: DoctorAvailability;
}
