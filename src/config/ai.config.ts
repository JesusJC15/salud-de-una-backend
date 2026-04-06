import { registerAs } from '@nestjs/config';

export default registerAs('ai', () => ({
  enabled: process.env.AI_ENABLED === 'true',
  provider: process.env.AI_PROVIDER ?? 'gemini',
  geminiApiKey: process.env.GEMINI_API_KEY || undefined,
  model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
}));
