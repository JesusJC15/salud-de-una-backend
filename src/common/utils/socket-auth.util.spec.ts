import {
  buildSocketCorsOriginFn,
  extractSocketToken,
} from './socket-auth.util';

describe('buildSocketCorsOriginFn', () => {
  const originalPatient = process.env.CORS_ORIGINS_PATIENT;
  const originalStaff = process.env.CORS_ORIGINS_STAFF;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.CORS_ORIGINS_PATIENT = originalPatient;
    process.env.CORS_ORIGINS_STAFF = originalStaff;
    process.env.NODE_ENV = originalNodeEnv;
  });

  function callOrigin(
    fn: ReturnType<typeof buildSocketCorsOriginFn>,
    origin: string | undefined,
  ): boolean | undefined {
    let result: boolean | undefined;
    fn(origin, (_err, allow) => {
      result = allow;
    });
    return result;
  }

  it('allows undefined origin (non-browser clients)', () => {
    const fn = buildSocketCorsOriginFn();
    expect(callOrigin(fn, undefined)).toBe(true);
  });

  it('allows any origin in dev when no allowlist is configured', () => {
    process.env.CORS_ORIGINS_PATIENT = '';
    process.env.CORS_ORIGINS_STAFF = '';
    process.env.NODE_ENV = 'development';
    const fn = buildSocketCorsOriginFn();
    expect(callOrigin(fn, 'http://any-origin.test')).toBe(true);
  });

  it('rejects non-allowed origin in production when allowlist is set', () => {
    process.env.CORS_ORIGINS_PATIENT = 'http://patient.app';
    process.env.CORS_ORIGINS_STAFF = '';
    process.env.NODE_ENV = 'production';
    const fn = buildSocketCorsOriginFn();
    expect(callOrigin(fn, 'http://attacker.evil')).toBe(false);
  });

  it('allows configured patient origin', () => {
    process.env.CORS_ORIGINS_PATIENT = 'http://patient.app';
    process.env.CORS_ORIGINS_STAFF = '';
    process.env.NODE_ENV = 'production';
    const fn = buildSocketCorsOriginFn();
    expect(callOrigin(fn, 'http://patient.app')).toBe(true);
  });

  it('allows configured staff origin', () => {
    process.env.CORS_ORIGINS_PATIENT = '';
    process.env.CORS_ORIGINS_STAFF = 'http://staff.app';
    process.env.NODE_ENV = 'production';
    const fn = buildSocketCorsOriginFn();
    expect(callOrigin(fn, 'http://staff.app')).toBe(true);
  });

  it('rejects any origin in production when allowlist is empty', () => {
    process.env.CORS_ORIGINS_PATIENT = '';
    process.env.CORS_ORIGINS_STAFF = '';
    process.env.NODE_ENV = 'production';
    const fn = buildSocketCorsOriginFn();
    expect(callOrigin(fn, 'http://any.app')).toBe(false);
  });
});

describe('extractSocketToken', () => {
  function makeClient(auth: Record<string, unknown>, headers = {}) {
    return {
      handshake: { auth, headers },
    } as never;
  }

  it('extracts token from handshake.auth.token', () => {
    const result = extractSocketToken(makeClient({ token: 'my-token' }));
    expect(result).toBe('my-token');
  });

  it('extracts token from Authorization header', () => {
    const result = extractSocketToken(
      makeClient({}, { authorization: 'Bearer header-token' }),
    );
    expect(result).toBe('header-token');
  });

  it('returns null when no token present', () => {
    const result = extractSocketToken(makeClient({}));
    expect(result).toBeNull();
  });

  it('returns null for non-string token in auth', () => {
    const result = extractSocketToken(makeClient({ token: 123 }));
    expect(result).toBeNull();
  });

  it('returns null for empty token string', () => {
    const result = extractSocketToken(makeClient({ token: '   ' }));
    expect(result).toBeNull();
  });
});
