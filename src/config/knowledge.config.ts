import { registerAs } from '@nestjs/config';

function parseCsv(value?: string): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export default registerAs('knowledge', () => ({
  uploadMaxBytes: parsePositiveInt(
    process.env.KNOWLEDGE_UPLOAD_MAX_BYTES,
    5 * 1024 * 1024,
  ),
  allowedMimeTypes: parseCsv(process.env.KNOWLEDGE_ALLOWED_MIME_TYPES),
  urlAllowlist: parseCsv(process.env.KNOWLEDGE_URL_ALLOWLIST),
  fetchTimeoutMs: parsePositiveInt(
    process.env.KNOWLEDGE_FETCH_TIMEOUT_MS,
    10_000,
  ),
  maxUrlContentBytes: parsePositiveInt(
    process.env.KNOWLEDGE_MAX_URL_CONTENT_BYTES,
    5 * 1024 * 1024,
  ),
}));
