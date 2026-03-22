import {
  RequestMetric,
  TechnicalMetricsSnapshot,
} from './technical-metrics.types';

export interface TechnicalMetricsStore {
  record(metric: RequestMetric): Promise<void>;
  getSummary(): Promise<TechnicalMetricsSnapshot>;
}
