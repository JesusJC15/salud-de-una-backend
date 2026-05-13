import { StructuredJsonLogger } from './structured-json.logger';

type LoggedPayload = {
  level: string;
  context?: string;
  message?: string;
  error_name?: string;
  stack?: string;
  a?: number;
  b?: string;
  foo?: string;
  n?: number;
};

describe('StructuredJsonLogger', () => {
  let stdoutWriteSpy: jest.SpiedFunction<typeof process.stdout.write>;
  let stderrWriteSpy: jest.SpiedFunction<typeof process.stderr.write>;

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

  const parsePayload = (
    writeSpy: jest.SpiedFunction<typeof process.stdout.write>,
    index = 0,
  ): LoggedPayload => {
    const raw = writeSpy.mock.calls[index]?.[0];
    expect(typeof raw).toBe('string');
    return JSON.parse(raw as string) as LoggedPayload;
  };

  it('writes simple string messages to stdout with context and level', () => {
    const logger = new StructuredJsonLogger('TEST_CTX');
    logger.log('hello world', 'CTX');

    expect(stdoutWriteSpy).toHaveBeenCalled();
    const payload = parsePayload(stdoutWriteSpy);
    expect(payload.level).toBe('info');
    expect(payload.context).toBe('CTX');
    expect(payload.message).toBe('hello world');
  });

  it('parses JSON-like string messages into object payloads', () => {
    const logger = new StructuredJsonLogger('JCTX');
    logger.log('{"a":1, "b":"x"}', 'JCTX');

    const payload = parsePayload(stdoutWriteSpy);
    expect(payload.a).toBe(1);
    expect(payload.b).toBe('x');
    expect(payload.message).toBeUndefined();
  });

  it('falls back to message when JSON parse fails', () => {
    const logger = new StructuredJsonLogger();
    logger.log('{invalid json}', 'CTX');

    const payload = parsePayload(stdoutWriteSpy);
    expect(payload.message).toBe('{invalid json}');
  });

  it('serializes Error objects with name and stack and writes to stderr for error()', () => {
    const logger = new StructuredJsonLogger('ERRCTX');
    const err = new Error('boom');
    logger.error(err, err.stack, 'ERRCTX');

    expect(stderrWriteSpy).toHaveBeenCalled();
    const payload = parsePayload(stderrWriteSpy);
    expect(payload.level).toBe('error');
    expect(payload.message).toBe('boom');
    expect(payload.error_name).toBe('Error');
    expect(typeof payload.stack).toBe('string');
  });

  it('handles object messages by merging them into payload', () => {
    const logger = new StructuredJsonLogger();
    logger.log({ foo: 'bar', n: 2 }, 'OBJCTX');

    const payload = parsePayload(stdoutWriteSpy);
    expect(payload.foo).toBe('bar');
    expect(payload.n).toBe(2);
  });

  it('handles non-object messages (array, number, null) and other log levels', () => {
    const logger = new StructuredJsonLogger('LCTX');
    logger.debug(['a', 'b'], 'LCTX');
    logger.verbose(123, 'LCTX');
    logger.warn(null, 'LCTX');

    expect(stdoutWriteSpy).toHaveBeenCalledTimes(3);
    expect(parsePayload(stdoutWriteSpy, 0).message).toBe('a,b');
    expect(parsePayload(stdoutWriteSpy, 1).message).toBe('123');
    expect(parsePayload(stdoutWriteSpy, 2).message).toBe('null');
  });
});
