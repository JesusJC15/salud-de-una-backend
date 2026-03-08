import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { Specialty } from '../../common/enums/specialty.enum';

export class RegisterDoctorDto {
  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/)
  password!: string;

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
