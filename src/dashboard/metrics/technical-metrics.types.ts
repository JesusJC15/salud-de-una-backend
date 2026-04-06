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
