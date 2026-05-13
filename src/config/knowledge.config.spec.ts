import knowledgeConfig from './knowledge.config';

type KnowledgeConfig = {
  uploadMaxBytes: number;
  allowedMimeTypes: string[];
  urlAllowlist: string[];
  fetchTimeoutMs: number;
  maxUrlContentBytes: number;
};

describe('knowledge.config', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  const getConfig = (): KnowledgeConfig => knowledgeConfig();

  it('parses CSV env values into arrays and trims/lowercases entries', () => {
    process.env.KNOWLEDGE_ALLOWED_MIME_TYPES =
      ' image/PNG, text/HTML,,application/pdf ';
    process.env.KNOWLEDGE_URL_ALLOWLIST = 'https://a.COM, , http://b.com/path ';

    const config = getConfig();

    expect(config.allowedMimeTypes).toEqual([
      'image/png',
      'text/html',
      'application/pdf',
    ]);
    expect(config.urlAllowlist).toEqual(['https://a.com', 'http://b.com/path']);
  });

  it('parses positive integers and falls back on invalid values', () => {
    process.env.KNOWLEDGE_UPLOAD_MAX_BYTES = '12345';
    process.env.KNOWLEDGE_FETCH_TIMEOUT_MS = '20000';
    process.env.KNOWLEDGE_MAX_URL_CONTENT_BYTES = '0';

    const config = getConfig();

    expect(config.uploadMaxBytes).toBe(12345);
    expect(config.fetchTimeoutMs).toBe(20000);
    expect(config.maxUrlContentBytes).toBe(5 * 1024 * 1024);
  });

  it('returns defaults when env vars are missing or invalid', () => {
    delete process.env.KNOWLEDGE_UPLOAD_MAX_BYTES;
    delete process.env.KNOWLEDGE_ALLOWED_MIME_TYPES;
    delete process.env.KNOWLEDGE_URL_ALLOWLIST;
    delete process.env.KNOWLEDGE_FETCH_TIMEOUT_MS;
    delete process.env.KNOWLEDGE_MAX_URL_CONTENT_BYTES;

    const config = getConfig();

    expect(config.allowedMimeTypes).toEqual([]);
    expect(config.urlAllowlist).toEqual([]);
    expect(config.uploadMaxBytes).toBe(5 * 1024 * 1024);
    expect(config.fetchTimeoutMs).toBe(10000);
    expect(config.maxUrlContentBytes).toBe(5 * 1024 * 1024);
  });
});
