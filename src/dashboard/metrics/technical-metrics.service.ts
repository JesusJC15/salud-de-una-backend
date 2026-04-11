import { Injectable, Logger } from '@nestjs/common';
import { InMemoryTechnicalMetricsStore } from './in-memory-technical-metrics.store';
import { RedisTechnicalMetricsStore } from './redis-technical-metrics.store';
import {
  RequestMetric,
  TechnicalMetricsSnapshot,
} from './technical-metrics.types';

@Injectable()
export class TechnicalMetricsService {
  private readonly logger = new Logger(TechnicalMetricsService.name);
  private static readonly REDIS_DISABLED_MESSAGE = 'Redis metrics store disabled';

  constructor(
    private readonly redisStore: RedisTechnicalMetricsStore,
    private readonly inMemoryStore: InMemoryTechnicalMetricsStore,
  ) {}

  async record(metric: RequestMetric): Promise<void> {
    try {
      await this.redisStore.record(metric);
      return;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message !== TechnicalMetricsService.REDIS_DISABLED_MESSAGE) {
        this.logger.warn(`Falling back to memory metrics store: ${message}`);
      }
      await this.inMemoryStore.record(metric);
    }
  }

  async getSummary(): Promise<TechnicalMetricsSnapshot> {
    try {
      return await this.redisStore.getSummary();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message !== TechnicalMetricsService.REDIS_DISABLED_MESSAGE) {
        this.logger.warn(`Reading technical metrics from memory: ${message}`);
      }
      const snapshot = await this.inMemoryStore.getSummary();
      return {
        ...snapshot,
        degraded: true,
      };
    }
  }
}
