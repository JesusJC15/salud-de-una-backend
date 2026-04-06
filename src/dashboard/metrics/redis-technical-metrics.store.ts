import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import {
  RequestMetric,
  TechnicalMetricsSnapshot,
} from './technical-metrics.types';
import { TechnicalMetricsStore } from './technical-metrics.store';

const REDIS_METRICS_STORE_DISABLED = 'Redis metrics store disabled';
const REDIS_METRICS_STORE_UNAVAILABLE = 'Redis metrics store unavailable';

@Injectable()
export class RedisTechnicalMetricsStore implements TechnicalMetricsStore {
  private readonly logger = new Logger(RedisTechnicalMetricsStore.name);
  private readonly metricsKey = 'technical-metrics';

  constructor(private readonly redisClient: Redis | null) {}

  async record(metric: RequestMetric): Promise<void> {
    if (!this.redisClient) {
      return;
    }

    const serializedMetric = JSON.stringify(metric);
    try {
      await this.redisClient
        .multi()
        .lpush(this.metricsKey, serializedMetric)
        .ltrim(this.metricsKey, 0, 999)
        .exec();
    } catch (error: unknown) {
      throw this.normalizeRedisError(error);
    }
  }

  async getSummary(): Promise<TechnicalMetricsSnapshot> {
    if (!this.redisClient) {
      throw new Error(REDIS_METRICS_STORE_DISABLED);
    }

    let rawMetrics: string[];
    try {
      rawMetrics = await this.redisClient.lrange(this.metricsKey, 0, 999);
    } catch (error: unknown) {
      throw this.normalizeRedisError(error);
    }
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

  private normalizeRedisError(error: unknown): Error {
    if (!this.redisClient) {
      return new Error(REDIS_METRICS_STORE_DISABLED);
    }

    const message = error instanceof Error ? error.message : String(error);
    if (this.redisClient.status === 'end') {
      return new Error(REDIS_METRICS_STORE_UNAVAILABLE);
    }

    return new Error(message);
  }
}
