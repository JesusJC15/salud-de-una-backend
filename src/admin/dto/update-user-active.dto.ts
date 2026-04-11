import { IsBoolean } from 'class-validator';

export class UpdateUserActiveDto {
  @IsBoolean()
  isActive!: boolean;
}
