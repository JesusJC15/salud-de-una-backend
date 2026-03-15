import authConfig from './auth.config';
import databaseConfig from './database.config';
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
