import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { Specialty } from '../../common/enums/specialty.enum';

// All fields are optional at the DTO level so the endpoint can be called with
// an empty body when the doctor already exists in MongoDB (Auth0 account linking).
// The controller validates required fields only when creating a new doctor profile.
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
