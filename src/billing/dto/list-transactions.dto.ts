import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { Specialty } from '../../common/enums/specialty.enum';
import type { TransactionStatus } from '../schemas/transaction.schema';

export class ListTransactionsDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiProperty({ required: false, enum: Specialty })
  @IsOptional()
  @IsEnum(Specialty)
  specialty?: Specialty;

  @ApiProperty({ required: false, enum: ['PENDING', 'COMPLETED', 'REFUNDED'] })
  @IsOptional()
  @IsEnum(['PENDING', 'COMPLETED', 'REFUNDED'])
  status?: TransactionStatus;

  @ApiProperty({ required: false, default: 1, minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiProperty({ required: false, default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;
}
