import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

export class InitiateCheckoutDto {
  @ApiProperty({ description: 'ID of the closed consultation to pay for' })
  @IsMongoId()
  consultationId!: string;
}
