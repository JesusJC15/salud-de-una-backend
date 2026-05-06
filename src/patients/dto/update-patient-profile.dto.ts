import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { UserGender } from '../../common/enums/user-gender.enum';

export class UpdatePatientProfileDto {
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(80)
  firstName?: string;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(80)
  lastName?: string;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsDateString()
  birthDate?: string;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsEnum(UserGender)
  gender?: UserGender;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsEmail()
  email?: string;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  currentPassword?: string;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword?: string;
}
