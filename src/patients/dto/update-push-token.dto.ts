import { IsString, Matches, MaxLength } from 'class-validator';

export class UpdatePushTokenDto {
  @IsString()
  @MaxLength(500)
  @Matches(/^(Expo|Exponent)PushToken\[[^\]]+\]$/, {
    message: 'Token Expo inválido',
  })
  token!: string;
}
