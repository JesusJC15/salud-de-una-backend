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
  refreshMaxActiveSessions: parsePositiveInt(
    process.env.REFRESH_MAX_ACTIVE_SESSIONS,
    3,
  ),
}));
