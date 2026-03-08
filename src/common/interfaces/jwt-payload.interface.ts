import { UserRole } from '../enums/user-role.enum';

export interface JwtPayload {
  sub: string;
  role: UserRole;
  email: string;
  iat?: number;
  exp?: number;
  tokenType?: 'access' | 'refresh';
}
