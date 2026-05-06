import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { Specialty } from '../../common/enums/specialty.enum';

export class ProvisionDoctorDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;

  @IsOptional()
  @IsEnum(Specialty)
  specialty?: Specialty;

  @IsOptional()
  @IsString()
  personalId?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  professionalLicense?: string;
}
