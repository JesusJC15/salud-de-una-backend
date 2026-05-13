import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePromptVersionDto {
  @ApiProperty({
    description:
      'Unique key for the prompt (e.g. triage.general_medicine.analyze)',
  })
  @IsString()
  @MaxLength(120)
  key!: string;

  @ApiProperty({ description: 'System instruction for the AI prompt' })
  @IsString()
  @MinLength(10)
  @MaxLength(8000)
  systemInstruction!: string;

  @ApiProperty({
    required: false,
    description: 'Override AI model for this prompt version',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;
}
