import {
  getRuntimeRole,
  runtimeRoleIncludesApi,
  runtimeRoleIncludesWorker,
} from './runtime-role.util';

describe('runtime-role.util', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('returns the configured runtime role after trimming and normalizing case', () => {
    process.env.APP_RUNTIME_ROLE = '  API ';

    expect(getRuntimeRole()).toBe('api');
  });

  it('falls back to all when the configured role is invalid', () => {
    process.env.APP_RUNTIME_ROLE = 'scheduler';

    expect(getRuntimeRole()).toBe('all');
  });

  it('includes api only for all and api roles', () => {
    expect(runtimeRoleIncludesApi('all')).toBe(true);
    expect(runtimeRoleIncludesApi('api')).toBe(true);
    expect(runtimeRoleIncludesApi('worker')).toBe(false);
  });

  it('includes worker only for all and worker roles', () => {
    expect(runtimeRoleIncludesWorker('all')).toBe(true);
    expect(runtimeRoleIncludesWorker('worker')).toBe(true);
    expect(runtimeRoleIncludesWorker('api')).toBe(false);
  });
});
