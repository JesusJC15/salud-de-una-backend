import { IsEnum, IsOptional } from 'class-validator';
import { UserRole } from '../../common/enums/user-role.enum';
import { PaginationSearchDto } from './pagination-search.dto';

export class ListUsersDto extends PaginationSearchDto {
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
