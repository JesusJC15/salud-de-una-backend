import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
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
  @IsNumber()
  @Min(30)
  @Max(260)
  heightCm?: number;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsNumber()
  @Min(1)
  @Max(400)
  weightKg?: number;

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
