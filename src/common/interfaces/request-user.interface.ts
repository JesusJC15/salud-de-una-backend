import { UserRole } from '../enums/user-role.enum';

export interface RequestUser {
  userId: string;
  email: string;
  role: UserRole;
  isActive: boolean;
}
