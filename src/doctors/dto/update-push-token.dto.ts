import { IsString, Matches, MaxLength } from 'class-validator';

export class UpdatePushTokenDto {
  @IsString()
  @MaxLength(200)
  @Matches(/^ExponentPushToken\[.+\]$/, { message: 'Token Expo inválido' })
  token!: string;
}
