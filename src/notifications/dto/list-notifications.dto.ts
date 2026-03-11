import { Type, Transform } from 'class-transformer';
import { IsBoolean, IsOptional, Max, Min } from 'class-validator';

export class ListNotificationsDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const v = value.toLowerCase();
      if (v === 'true' || v === '1') {
        return true;
      }
      if (v === 'false' || v === '0') {
        return false;
      }
      return undefined;
    }
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
    return undefined;
  })
  @IsBoolean()
  unreadOnly?: boolean;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number;
}
