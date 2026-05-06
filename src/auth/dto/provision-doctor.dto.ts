import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Specialty } from '../../common/enums/specialty.enum';

export class ProvisionDoctorDto {
  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsEnum(Specialty)
  specialty!: Specialty;

  @IsString()
  personalId!: string;

  @IsString()
  phoneNumber!: string;

  @IsOptional()
  @IsString()
  professionalLicense?: string;
}
