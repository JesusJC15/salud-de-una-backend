import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

export class UpdatePriceDto {
  @ApiProperty({ description: 'New price in COP (e.g. 15000)', minimum: 0 })
  @IsNumber()
  @Min(0)
  amount!: number;
}
