import { UserRole } from '../enums/user-role.enum';
import type { RequestContext } from '../interfaces/request-context.interface';
import type { RequestUser } from '../interfaces/request-user.interface';

export function buildRequestUser(
  overrides: Partial<RequestUser> = {},
): RequestUser {
  const userId = overrides.userId ?? 'user-1';

  return {
    userId,
    email: overrides.email ?? `${userId}@test.com`,
    role: overrides.role ?? UserRole.PATIENT,
    isActive: overrides.isActive ?? true,
  };
}

export function buildRequestContext(
  input: {
    user?: Partial<RequestUser>;
    correlationId?: string;
  } = {},
): RequestContext {
  return {
    user: buildRequestUser(input.user),
    correlationId: input.correlationId,
  } as RequestContext;
}
