import {
  IsDateString,
  IsEnum,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { UserGender } from '../../common/enums/user-gender.enum';

export class ProvisionPatientDto {
  @IsString()
  @MaxLength(80)
  firstName!: string;

  @IsString()
  @MaxLength(80)
  lastName!: string;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsDateString()
  birthDate?: string;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsEnum(UserGender)
  gender?: UserGender;
}
