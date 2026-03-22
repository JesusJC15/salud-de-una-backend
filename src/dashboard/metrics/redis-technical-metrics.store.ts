import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { RedisHealthService } from '../../redis/redis-health.service';
import {
  RequestMetric,
  TechnicalMetricsSnapshot,
} from './technical-metrics.types';
import { TechnicalMetricsStore } from './technical-metrics.store';

@Injectable()
export class RedisTechnicalMetricsStore implements TechnicalMetricsStore {
  private readonly logger = new Logger(RedisTechnicalMetricsStore.name);
  private readonly metricsKey = 'technical-metrics';

  constructor(
    private readonly redisHealthService: RedisHealthService,
    private readonly redisClient: Redis | null,
  ) {}

  async record(metric: RequestMetric): Promise<void> {
    if (!this.redisClient || !(await this.redisHealthService.isAvailable())) {
      throw new Error('Redis metrics store unavailable');
    }

    const serializedMetric = JSON.stringify(metric);
    await this.redisClient
      .multi()
      .lpush(this.metricsKey, serializedMetric)
      .ltrim(this.metricsKey, 0, 999)
      .exec();
  }

  async getSummary(): Promise<TechnicalMetricsSnapshot> {
    if (!this.redisClient || !(await this.redisHealthService.isAvailable())) {
      throw new Error('Redis metrics store unavailable');
    }

    const rawMetrics = await this.redisClient.lrange(this.metricsKey, 0, 999);
    const metrics = rawMetrics.flatMap((value) => {
      try {
        return [JSON.parse(value) as RequestMetric];
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Ignoring invalid Redis metric payload: ${message}`);
        return [];
      }
    });

    return this.buildSnapshot(metrics);
  }

  private buildSnapshot(metrics: RequestMetric[]): TechnicalMetricsSnapshot {
    const total = metrics.length;
    const sortedLatencies = metrics
      .map((metric) => metric.latencyMs)
      .sort((a, b) => a - b);
    const p95Index = Math.max(0, Math.ceil(sortedLatencies.length * 0.95) - 1);
    const p95LatencyMs = sortedLatencies[p95Index] ?? 0;
    const errors = metrics.filter((metric) => metric.statusCode >= 500).length;
    const errorRate =
      total > 0 ? Number(((errors / total) * 100).toFixed(2)) : 0;

    return {
      sampleSize: total,
      p95LatencyMs,
      errorRate,
      timestamp: new Date().toISOString(),
      source: 'redis',
      degraded: false,
    };
  }
}
