import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';

const isTestRuntime =
  process.env.NODE_ENV === 'test' || Boolean(process.env.JEST_WORKER_ID);
const telemetryEnabled = process.env.OTEL_ENABLED === 'true' && !isTestRuntime;

let telemetrySdk: NodeSDK | null = null;

if (telemetryEnabled) {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);

  const tracesEndpoint =
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ??
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  telemetrySdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'salud-de-una-backend',
    traceExporter: tracesEndpoint
      ? new OTLPTraceExporter({ url: tracesEndpoint })
      : undefined,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': {
          enabled: false,
        },
      }),
    ],
  });

  telemetrySdk.start();

  const shutdownTelemetry = async () => {
    if (!telemetrySdk) {
      return;
    }

    try {
      await telemetrySdk.shutdown();
    } catch {
      // Best-effort shutdown: avoid blocking process termination.
    }
  };

  process.once('SIGTERM', () => {
    void shutdownTelemetry();
  });
  process.once('SIGINT', () => {
    void shutdownTelemetry();
  });
}

export function getTelemetrySdk(): NodeSDK | null {
  return telemetrySdk;
}
