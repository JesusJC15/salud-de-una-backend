import { IsDefined, IsString } from 'class-validator';

export class TriageAnswerInputDto {
  @IsString()
  questionId!: string;

  @IsDefined()
  answerValue!: unknown;
}
