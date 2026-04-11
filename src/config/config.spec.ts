import aiConfig from './ai.config';
import authConfig from './auth.config';
import databaseConfig from './database.config';
import redisConfig from './redis.config';
import webConfig from './web.config';

describe('config factories', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('authConfig should map environment values', () => {
    process.env.JWT_SECRET = 'secret';
    process.env.JWT_REFRESH_SECRET = 'refresh';
    process.env.JWT_ACCESS_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '30d';

    const config = authConfig();

    expect(config.jwtSecret).toBe('secret');
    expect(config.jwtRefreshSecret).toBe('refresh');
    expect(config.accessTokenExpiresIn).toBe('15m');
    expect(config.refreshTokenExpiresIn).toBe('30d');
  });

  it('authConfig should fall back to defaults when expires are missing', () => {
    delete process.env.JWT_ACCESS_EXPIRES_IN;
    delete process.env.JWT_REFRESH_EXPIRES_IN;

    const config = authConfig();

    expect(config.accessTokenExpiresIn).toBe('1h');
    expect(config.refreshTokenExpiresIn).toBe('7d');
  });

  it('databaseConfig should map database uri', () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/db';
    const config = databaseConfig();
    expect(config.uri).toBe('mongodb://localhost:27017/db');
  });

  it('redisConfig should map redis values with defaults', () => {
    process.env.REDIS_URL = 'rediss://default:secret@example.redis.cloud:6379';

    const config = redisConfig();

    expect(config.url).toBe('rediss://default:secret@example.redis.cloud:6379');
    expect(config.keyPrefix).toBe('salud-de-una');
    expect(config.outboxDispatchIntervalMs).toBe(1000);
  });

  it('redisConfig should keep explicit prefix and valid interval', () => {
    process.env.REDIS_KEY_PREFIX = '';
    process.env.OUTBOX_DISPATCH_INTERVAL_MS = '2500';

    const config = redisConfig();

    expect(config.keyPrefix).toBe('');
    expect(config.outboxDispatchIntervalMs).toBe(2500);
  });

  it('redisConfig should fallback interval for invalid values', () => {
    process.env.OUTBOX_DISPATCH_INTERVAL_MS = '-10';

    let config = redisConfig();
    expect(config.outboxDispatchIntervalMs).toBe(1000);

    process.env.OUTBOX_DISPATCH_INTERVAL_MS = 'abc';
    config = redisConfig();
    expect(config.outboxDispatchIntervalMs).toBe(1000);
  });

  it('aiConfig should map ai flags and defaults', () => {
    process.env.AI_ENABLED = 'true';
    process.env.AI_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'key';

    const config = aiConfig();

    expect(config.enabled).toBe(true);
    expect(config.provider).toBe('gemini');
    expect(config.geminiApiKey).toBe('key');
    expect(config.model).toBe('gemini-2.5-flash');
  });

  it('aiConfig should use defaults when ai env vars are missing', () => {
    delete process.env.AI_ENABLED;
    delete process.env.AI_PROVIDER;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_MODEL;

    const config = aiConfig();

    expect(config.enabled).toBe(false);
    expect(config.provider).toBe('gemini');
    expect(config.geminiApiKey).toBeUndefined();
    expect(config.model).toBe('gemini-2.5-flash');
  });

  it('aiConfig should map custom model and treat empty api key as undefined', () => {
    process.env.AI_ENABLED = 'true';
    process.env.GEMINI_API_KEY = '';
    process.env.GEMINI_MODEL = 'gemini-custom-model';

    const config = aiConfig();

    expect(config.enabled).toBe(true);
    expect(config.geminiApiKey).toBeUndefined();
    expect(config.model).toBe('gemini-custom-model');
  });

  it('webConfig should parse CORS origins and numeric limits', () => {
    process.env.CORS_ORIGINS_PATIENT = 'http://a.com, http://b.com,';
    process.env.CORS_ORIGINS_STAFF = 'http://c.com';
    process.env.REFRESH_MAX_ACTIVE_SESSIONS = '5';

    const config = webConfig();

    expect(config.corsOriginsPatient).toEqual(['http://a.com', 'http://b.com']);
    expect(config.corsOriginsStaff).toEqual(['http://c.com']);
    expect(config.refreshMaxActiveSessions).toBe(5);
  });

  it('webConfig should fallback on invalid refresh max sessions', () => {
    process.env.REFRESH_MAX_ACTIVE_SESSIONS = '0';
    const config = webConfig();
    expect(config.refreshMaxActiveSessions).toBe(3);
  });
});
