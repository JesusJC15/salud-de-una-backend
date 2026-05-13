import knowledgeConfig from './knowledge.config';

describe('knowledge.config', () => {
  const ORIGINAL = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL };
  });

  afterAll(() => {
    process.env = ORIGINAL;
  });

  it('parses CSV env values into arrays and trims/lowercases entries', () => {
    process.env.KNOWLEDGE_ALLOWED_MIME_TYPES =
      ' image/PNG, text/HTML,,application/pdf ';
    process.env.KNOWLEDGE_URL_ALLOWLIST = 'https://a.COM, , http://b.com/path ';

    const cfg = (knowledgeConfig as any)();
    expect(cfg.allowedMimeTypes).toEqual([
      'image/png',
      'text/html',
      'application/pdf',
    ]);
    expect(cfg.urlAllowlist).toEqual(['https://a.com', 'http://b.com/path']);
  });

  it('parses positive integers and falls back on invalid values', () => {
    process.env.KNOWLEDGE_UPLOAD_MAX_BYTES = '12345';
    process.env.KNOWLEDGE_FETCH_TIMEOUT_MS = '20000';
    process.env.KNOWLEDGE_MAX_URL_CONTENT_BYTES = '0';

    const cfg = (knowledgeConfig as any)();
    expect(cfg.uploadMaxBytes).toBe(12345);
    expect(cfg.fetchTimeoutMs).toBe(20000);
    // zero is not positive -> fallback default
    expect(cfg.maxUrlContentBytes).toBe(5 * 1024 * 1024);
  });

  it('returns defaults when env vars are missing or invalid', () => {
    delete process.env.KNOWLEDGE_UPLOAD_MAX_BYTES;
    delete process.env.KNOWLEDGE_ALLOWED_MIME_TYPES;
    delete process.env.KNOWLEDGE_URL_ALLOWLIST;
    delete process.env.KNOWLEDGE_FETCH_TIMEOUT_MS;
    delete process.env.KNOWLEDGE_MAX_URL_CONTENT_BYTES;

    const cfg = (knowledgeConfig as any)();
    expect(cfg.allowedMimeTypes).toEqual([]);
    expect(cfg.urlAllowlist).toEqual([]);
    expect(cfg.uploadMaxBytes).toBe(5 * 1024 * 1024);
    expect(cfg.fetchTimeoutMs).toBe(10000);
    expect(cfg.maxUrlContentBytes).toBe(5 * 1024 * 1024);
  });
});
