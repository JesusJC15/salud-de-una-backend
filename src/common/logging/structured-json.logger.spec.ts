import { StructuredJsonLogger } from './structured-json.logger';

describe('StructuredJsonLogger', () => {
  let stdoutWriteSpy: jest.SpyInstance;
  let stderrWriteSpy: jest.SpyInstance;

  beforeEach(() => {
    stdoutWriteSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    stderrWriteSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutWriteSpy.mockRestore();
    stderrWriteSpy.mockRestore();
    jest.restoreAllMocks();
  });

  it('writes simple string messages to stdout with context and level', () => {
    const logger = new StructuredJsonLogger('TEST_CTX');
    logger.log('hello world', 'CTX');
    expect(stdoutWriteSpy).toHaveBeenCalled();
    const raw = stdoutWriteSpy.mock.calls[0][0] as string;
    const payload = JSON.parse(raw);
    expect(payload.level).toBe('info');
    expect(payload.context).toBe('CTX');
    expect(payload.message).toBe('hello world');
  });

  it('parses JSON-like string messages into object payloads', () => {
    const logger = new StructuredJsonLogger('JCTX');
    logger.log('{"a":1, "b":"x"}', 'JCTX');
    const raw = stdoutWriteSpy.mock.calls[0][0] as string;
    const payload = JSON.parse(raw);
    expect(payload.a).toBe(1);
    expect(payload.b).toBe('x');
    expect(payload.message).toBeUndefined();
  });

  it('falls back to message when JSON parse fails', () => {
    const logger = new StructuredJsonLogger();
    logger.log('{invalid json}', 'CTX');
    const raw = stdoutWriteSpy.mock.calls[0][0] as string;
    const payload = JSON.parse(raw);
    expect(payload.message).toBe('{invalid json}');
  });

  it('serializes Error objects with name and stack and writes to stderr for error()', () => {
    const logger = new StructuredJsonLogger('ERRCTX');
    const err = new Error('boom');
    logger.error(err, err.stack, 'ERRCTX');
    expect(stderrWriteSpy).toHaveBeenCalled();
    const raw = stderrWriteSpy.mock.calls[0][0] as string;
    const payload = JSON.parse(raw);
    expect(payload.level).toBe('error');
    expect(payload.message).toBe('boom');
    expect(payload.error_name).toBe('Error');
    expect(typeof payload.stack).toBe('string');
  });

  it('handles object messages by merging them into payload', () => {
    const logger = new StructuredJsonLogger();
    logger.log({ foo: 'bar', n: 2 }, 'OBJCTX');
    const raw = stdoutWriteSpy.mock.calls[0][0] as string;
    const payload = JSON.parse(raw);
    expect(payload.foo).toBe('bar');
    expect(payload.n).toBe(2);
  });

  it('handles non-object messages (array, number, null) and other log levels', () => {
    const logger = new StructuredJsonLogger('LCTX');
    logger.debug(['a', 'b'], 'LCTX');
    logger.verbose(123, 'LCTX');
    logger.warn(null, 'LCTX');

    expect(stdoutWriteSpy).toHaveBeenCalledTimes(3);
    const payload1 = JSON.parse(stdoutWriteSpy.mock.calls[0][0] as string);
    expect(payload1.message).toBe('a,b');

    const payload2 = JSON.parse(stdoutWriteSpy.mock.calls[1][0] as string);
    expect(payload2.message).toBe('123');

    const payload3 = JSON.parse(stdoutWriteSpy.mock.calls[2][0] as string);
    expect(payload3.message).toBe('null');
  });
});
