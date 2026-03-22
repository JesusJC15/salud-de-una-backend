import { InMemoryTechnicalMetricsStore } from './in-memory-technical-metrics.store';

describe('InMemoryTechnicalMetricsStore', () => {
  it('should return empty summary when no metrics exist', async () => {
    const store = new InMemoryTechnicalMetricsStore();

    await expect(store.getSummary()).resolves.toMatchObject({
      sampleSize: 0,
      p95LatencyMs: 0,
      errorRate: 0,
      source: 'memory',
      degraded: false,
    });
  });

  it('should trim metrics to last 1000 items and compute error rate', async () => {
    const store = new InMemoryTechnicalMetricsStore();

    for (let index = 1; index <= 1_005; index += 1) {
      await store.record({
        method: 'GET',
        path: `/items/${index}`,
        statusCode: index % 10 === 0 ? 500 : 200,
        latencyMs: index,
        timestamp: new Date().toISOString(),
      });
    }

    const summary = await store.getSummary();

    expect(summary.sampleSize).toBe(1000);
    expect(summary.p95LatencyMs).toBeGreaterThan(0);
    expect(summary.errorRate).toBe(10);
  });
});
