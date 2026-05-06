import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { UserGender } from '../../common/enums/user-gender.enum';

// Password changes are handled by Auth0 Universal Login.
// Use Auth0's /dbconnections/change_password endpoint from the client.
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
}
