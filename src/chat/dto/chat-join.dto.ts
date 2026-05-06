import { IsMongoId } from 'class-validator';

export class ChatJoinDto {
  @IsMongoId()
  consultationId!: string;
}
