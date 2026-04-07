import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsString,
  Matches,
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
  currentPassword?: string;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/)
  newPassword?: string;
}
