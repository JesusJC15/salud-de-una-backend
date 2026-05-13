import { IsIn, IsOptional, IsString } from 'class-validator';
import { RetrieveDto } from './retrieve.dto';

export class AnswerDto extends RetrieveDto {
  @IsOptional()
  @IsString()
  @IsIn(['STAFF', 'PATIENT'])
  mode?: 'STAFF' | 'PATIENT';
}
