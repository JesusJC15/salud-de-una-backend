import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { Specialty } from '../../common/enums/specialty.enum';

export class ProvisionDoctorDto {
  @IsString()
  @MaxLength(80)
  firstName!: string;

  @IsString()
  @MaxLength(80)
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
