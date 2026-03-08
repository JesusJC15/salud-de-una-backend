import { Injectable } from '@nestjs/common';

interface RequestMetric {
  latencyMs: number;
  statusCode: number;
}

@Injectable()
export class DashboardService {
  private readonly metrics: RequestMetric[] = [];

  record(metric: RequestMetric): void {
    this.metrics.push(metric);
    if (this.metrics.length > 1000) {
      this.metrics.shift();
    }
  }

  getTechnicalMetrics() {
    const total = this.metrics.length;
    const sortedLatencies = this.metrics
      .map((m) => m.latencyMs)
      .sort((a, b) => a - b);
    const p95Index = Math.max(0, Math.ceil(sortedLatencies.length * 0.95) - 1);
    const p95LatencyMs = sortedLatencies[p95Index] ?? 0;
    const errors = this.metrics.filter((m) => m.statusCode >= 500).length;
    const errorRate = total > 0 ? (errors / total) * 100 : 0;

    return {
      sampleSize: total,
      p95LatencyMs,
      errorRate,
      timestamp: new Date().toISOString(),
    };
  }
}
