import { registerAs } from '@nestjs/config';

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export default registerAs('redis', () => ({
  url: process.env.REDIS_URL,
  keyPrefix: process.env.REDIS_KEY_PREFIX ?? 'salud-de-una',
  outboxDispatchIntervalMs: parsePositiveInt(
    process.env.OUTBOX_DISPATCH_INTERVAL_MS,
    1_000,
  ),
}));
