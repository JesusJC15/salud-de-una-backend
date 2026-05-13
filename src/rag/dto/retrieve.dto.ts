import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Specialty } from '../../common/enums/specialty.enum';

export class RetrieveDto {
  @IsString()
  @MaxLength(1000)
  query!: string;

  @IsOptional()
  @IsString()
  @IsIn(Object.values(Specialty))
  specialty?: Specialty;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  useCase?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  audience?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  topK?: number;
}
