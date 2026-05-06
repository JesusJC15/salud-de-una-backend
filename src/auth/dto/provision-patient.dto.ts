import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { UserGender } from '../../common/enums/user-gender.enum';

export class ProvisionPatientDto {
  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsEnum(UserGender)
  gender?: UserGender;
}
