import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Specialty } from '../../common/enums/specialty.enum';

export class RetrieveDto {
  @IsString()
  query!: string;

  @IsOptional()
  @IsString()
  @IsIn(Object.values(Specialty))
  specialty?: Specialty;

  @IsOptional()
  @IsString()
  useCase?: string;

  @IsOptional()
  @IsString()
  audience?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  topK?: number;
}
