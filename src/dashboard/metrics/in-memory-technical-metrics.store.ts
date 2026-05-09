import { Injectable } from '@nestjs/common';
import {
  buildMetricsSnapshot,
  RequestMetric,
  TechnicalMetricsSnapshot,
} from './technical-metrics.types';
import { TechnicalMetricsStore } from './technical-metrics.store';

@Injectable()
export class InMemoryTechnicalMetricsStore implements TechnicalMetricsStore {
  private readonly metrics: RequestMetric[] = [];

  record(metric: RequestMetric): Promise<void> {
    this.metrics.push(metric);
    if (this.metrics.length > 1000) {
      this.metrics.shift();
    }

    return Promise.resolve();
  }

  getSummary(): Promise<TechnicalMetricsSnapshot> {
    return Promise.resolve(buildMetricsSnapshot(this.metrics, 'memory', false));
  }
}
