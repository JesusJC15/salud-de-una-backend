import { UserRole } from '../../common/enums/user-role.enum';

export class AuthMeResponseDto {
  user!: {
    id: string;
    email: string;
    role: UserRole;
    isActive: boolean;
  };
}
