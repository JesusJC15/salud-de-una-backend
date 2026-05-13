export const RUNTIME_ROLES = ['all', 'api', 'worker'] as const;

export type RuntimeRole = (typeof RUNTIME_ROLES)[number];

export function getRuntimeRole(): RuntimeRole {
  const rawRole = (process.env.APP_RUNTIME_ROLE ?? 'all').trim().toLowerCase();

  if ((RUNTIME_ROLES as readonly string[]).includes(rawRole)) {
    return rawRole as RuntimeRole;
  }

  return 'all';
}

export function runtimeRoleIncludesApi(role = getRuntimeRole()): boolean {
  return role === 'all' || role === 'api';
}

export function runtimeRoleIncludesWorker(role = getRuntimeRole()): boolean {
  return role === 'all' || role === 'worker';
}
