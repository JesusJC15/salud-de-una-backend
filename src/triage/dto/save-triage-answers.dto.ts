import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { TriageAnswerInputDto } from './triage-answer-input.dto';

export class SaveTriageAnswersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TriageAnswerInputDto)
  answers!: TriageAnswerInputDto[];
}
