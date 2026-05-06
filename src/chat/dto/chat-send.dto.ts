import { IsMongoId, IsString, MaxLength, MinLength } from 'class-validator';

export class ChatSendDto {
  @IsMongoId()
  consultationId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content!: string;
}
