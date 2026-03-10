import { registerAs } from '@nestjs/config';

function parseCsv(value?: string): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export default registerAs('web', () => ({
  corsOriginsPatient: parseCsv(process.env.CORS_ORIGINS_PATIENT),
  corsOriginsStaff: parseCsv(process.env.CORS_ORIGINS_STAFF),
  accessTokenCookieName:
    process.env.ACCESS_TOKEN_COOKIE_NAME ?? 'sdu_access_token',
  refreshTokenCookieName:
    process.env.REFRESH_TOKEN_COOKIE_NAME ?? 'sdu_refresh_token',
  csrfCookieName: process.env.CSRF_COOKIE_NAME ?? 'csrf_token',
  csrfHeaderName: process.env.CSRF_HEADER_NAME ?? 'x-csrf-token',
  cookieDomain: process.env.COOKIE_DOMAIN,
  cookiePath: process.env.COOKIE_PATH ?? '/',
  cookieSameSite: (process.env.COOKIE_SAME_SITE?.toLowerCase() ?? 'lax') as
    | 'lax'
    | 'strict'
    | 'none',
  cookieSecure:
    process.env.COOKIE_SECURE?.toLowerCase() === 'true' ||
    process.env.NODE_ENV === 'production',
  refreshMaxActiveSessions: parsePositiveInt(
    process.env.REFRESH_MAX_ACTIVE_SESSIONS,
    3,
  ),
}));
