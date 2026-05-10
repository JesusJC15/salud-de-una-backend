import { registerAs } from '@nestjs/config';

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseCsv(value: string | undefined, fallback: string[]): string[] {
  if (!value?.trim()) {
    return fallback;
  }

  return value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
}

export default registerAs('knowledge', () => ({
  uploadMaxBytes: parsePositiveInt(
    process.env.KNOWLEDGE_UPLOAD_MAX_BYTES,
    5 * 1024 * 1024,
  ),
  urlFetchTimeoutMs: parsePositiveInt(
    process.env.KNOWLEDGE_URL_FETCH_TIMEOUT_MS,
    10_000,
  ),
  urlMaxBytes: parsePositiveInt(
    process.env.KNOWLEDGE_URL_MAX_BYTES,
    5 * 1024 * 1024,
  ),
  urlMaxRedirects: parsePositiveInt(
    process.env.KNOWLEDGE_URL_MAX_REDIRECTS,
    3,
  ),
  allowedMimeTypes: parseCsv(process.env.KNOWLEDGE_ALLOWED_MIME_TYPES, [
    'text/plain',
    'text/html',
    'text/markdown',
    'application/json',
    'text/csv',
    'application/pdf',
  ]),
}));
