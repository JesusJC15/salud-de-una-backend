type TelemetryModule = typeof import('./telemetry');

describe('observability/telemetry', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  const importTelemetryModule = (): TelemetryModule => {
    const module = jest.requireActual(
      './telemetry',
    ) as unknown as TelemetryModule;
    return module;
  };

  const mockOpenTelemetryDependencies = (options?: {
    shutdown?: jest.Mock<Promise<void>, []>;
  }) => {
    const start = jest.fn();
    const shutdown =
      options?.shutdown ?? jest.fn<Promise<void>, []>().mockResolvedValue();
    const nodeSdk = { start, shutdown };
    const nodeSdkConstructor = jest.fn().mockImplementation(() => nodeSdk);
    const otlpTraceExporterConstructor = jest
      .fn()
      .mockImplementation((config: { url: string }) => ({ config }));
    const getNodeAutoInstrumentations = jest
      .fn()
      .mockReturnValue(['instrumentation']);

    jest.doMock('@opentelemetry/sdk-node', () => ({
      NodeSDK: nodeSdkConstructor,
    }));
    jest.doMock('@opentelemetry/exporter-trace-otlp-http', () => ({
      OTLPTraceExporter: otlpTraceExporterConstructor,
    }));
    jest.doMock('@opentelemetry/auto-instrumentations-node', () => ({
      getNodeAutoInstrumentations,
    }));

    return {
      getNodeAutoInstrumentations,
      nodeSdk,
      nodeSdkConstructor,
      otlpTraceExporterConstructor,
    };
  };

  it('returns null sdk by default (test runtime)', () => {
    process.env.NODE_ENV = 'test';

    const mod = importTelemetryModule();

    expect(mod.getTelemetrySdk()).toBeNull();
  });

  it('returns null when OTEL_ENABLED=true but running in test worker', () => {
    process.env.OTEL_ENABLED = 'true';
    process.env.JEST_WORKER_ID = '1';

    const mod = importTelemetryModule();

    expect(mod.getTelemetrySdk()).toBeNull();
  });

  it('initializes SDK when OTEL_ENABLED=true and not test runtime', () => {
    const {
      getNodeAutoInstrumentations,
      nodeSdk,
      nodeSdkConstructor,
      otlpTraceExporterConstructor,
    } = mockOpenTelemetryDependencies();

    delete process.env.JEST_WORKER_ID;
    delete process.env.NODE_ENV;
    process.env.OTEL_ENABLED = 'true';
    process.env.OTEL_SERVICE_NAME = 'custom-telemetry-service';
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT =
      'http://localhost:4318/v1/traces';

    const processOnceSpy = jest
      .spyOn(process, 'once')
      .mockImplementation((signal, handler) => {
        expect(['SIGTERM', 'SIGINT']).toContain(signal);
        expect(typeof handler).toBe('function');
        return process;
      });

    const mod = importTelemetryModule();

    expect(mod.getTelemetrySdk()).toBe(nodeSdk as never);
    expect(nodeSdkConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceName: 'custom-telemetry-service',
        instrumentations: [['instrumentation']],
      }),
    );
    expect(otlpTraceExporterConstructor).toHaveBeenCalledWith({
      url: 'http://localhost:4318/v1/traces',
    });
    expect(getNodeAutoInstrumentations).toHaveBeenCalledWith({
      '@opentelemetry/instrumentation-fs': {
        enabled: false,
      },
    });
    expect(nodeSdk.start).toHaveBeenCalledTimes(1);
    expect(processOnceSpy).toHaveBeenCalledTimes(2);
  });

  it('falls back to the generic OTLP endpoint when traces endpoint is unset', () => {
    const { nodeSdkConstructor, otlpTraceExporterConstructor } =
      mockOpenTelemetryDependencies();

    delete process.env.JEST_WORKER_ID;
    delete process.env.NODE_ENV;
    process.env.OTEL_ENABLED = 'true';
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';

    const mod = importTelemetryModule();

    expect(mod.getTelemetrySdk()).not.toBeNull();
    expect(otlpTraceExporterConstructor).toHaveBeenCalledWith({
      url: 'http://localhost:4318',
    });
    expect(nodeSdkConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceName: 'salud-de-una-backend',
      }),
    );
  });

  it('shuts down best-effort when the process signal handler runs', async () => {
    const shutdown = jest
      .fn<Promise<void>, []>()
      .mockRejectedValue(new Error('shutdown failed'));
    const { nodeSdk } = mockOpenTelemetryDependencies({ shutdown });

    delete process.env.JEST_WORKER_ID;
    delete process.env.NODE_ENV;
    process.env.OTEL_ENABLED = 'true';

    const signalHandlers = new Map<string, () => void>();
    jest.spyOn(process, 'once').mockImplementation((signal, handler) => {
      if (typeof signal === 'string') {
        signalHandlers.set(signal, handler);
      }
      return process;
    });

    const mod = importTelemetryModule();
    expect(mod.getTelemetrySdk()).toBe(nodeSdk as never);

    signalHandlers.get('SIGTERM')?.();
    await new Promise<void>((resolve) => {
      setImmediate(() => resolve());
    });

    expect(shutdown).toHaveBeenCalledTimes(1);
  });

  it('does not create a trace exporter when no OTLP endpoint is configured', () => {
    const { nodeSdkConstructor } = mockOpenTelemetryDependencies();

    delete process.env.JEST_WORKER_ID;
    delete process.env.NODE_ENV;
    process.env.OTEL_ENABLED = 'true';

    importTelemetryModule();

    expect(nodeSdkConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        traceExporter: undefined,
      }),
    );
  });
});
