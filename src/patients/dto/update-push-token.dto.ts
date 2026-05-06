import { IsString, MaxLength } from 'class-validator';

export class UpdatePushTokenDto {
  @IsString()
  @MaxLength(500)
  token!: string;
}
