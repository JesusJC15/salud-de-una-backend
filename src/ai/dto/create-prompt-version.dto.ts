import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreatePromptVersionDto {
  @ApiProperty({
    description:
      'Unique key for the prompt (e.g. triage.general_medicine.analyze)',
  })
  @IsString()
  key!: string;

  @ApiProperty({ description: 'System instruction for the AI prompt' })
  @IsString()
  @MinLength(10)
  systemInstruction!: string;

  @ApiProperty({
    required: false,
    description: 'Override AI model for this prompt version',
  })
  @IsOptional()
  @IsString()
  model?: string;
}
