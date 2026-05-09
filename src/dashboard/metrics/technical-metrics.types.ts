export type RequestMetric = {
  latencyMs: number;
  statusCode: number;
};

export type TechnicalMetricsSnapshot = {
  sampleSize: number;
  p95LatencyMs: number;
  errorRate: number;
  timestamp: string;
  source: 'redis' | 'memory';
  degraded: boolean;
};

export function buildMetricsSnapshot(
  metrics: RequestMetric[],
  source: 'redis' | 'memory',
  degraded: boolean,
): TechnicalMetricsSnapshot {
  const total = metrics.length;
  const sortedLatencies = metrics
    .map((metric) => metric.latencyMs)
    .sort((a, b) => a - b);
  const p95Index = Math.max(0, Math.ceil(sortedLatencies.length * 0.95) - 1);
  const p95LatencyMs = sortedLatencies[p95Index] ?? 0;
  const errors = metrics.filter((metric) => metric.statusCode >= 500).length;
  const errorRate = total > 0 ? Number(((errors / total) * 100).toFixed(2)) : 0;

  return {
    sampleSize: total,
    p95LatencyMs,
    errorRate,
    timestamp: new Date().toISOString(),
    source,
    degraded,
  };
}
