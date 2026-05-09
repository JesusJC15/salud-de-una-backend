import { IsOptional, IsString } from 'class-validator';

export class ListKnowledgeDocumentsDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  specialty?: string;

  @IsOptional()
  @IsString()
  sourceId?: string;
}
