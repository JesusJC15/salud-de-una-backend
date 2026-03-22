import { Test, TestingModule } from '@nestjs/testing';
import { InMemoryTechnicalMetricsStore } from './in-memory-technical-metrics.store';
import { RedisTechnicalMetricsStore } from './redis-technical-metrics.store';
import { TechnicalMetricsService } from './technical-metrics.service';

describe('TechnicalMetricsService', () => {
  let service: TechnicalMetricsService;
  const redisStore = {
    record: jest.fn(),
    getSummary: jest.fn(),
  };
  const inMemoryStore = {
    record: jest.fn(),
    getSummary: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TechnicalMetricsService,
        { provide: RedisTechnicalMetricsStore, useValue: redisStore },
        { provide: InMemoryTechnicalMetricsStore, useValue: inMemoryStore },
      ],
    }).compile();

    service = module.get<TechnicalMetricsService>(TechnicalMetricsService);
  });

  it('should use Redis store when available', async () => {
    redisStore.getSummary.mockResolvedValue({
      sampleSize: 1,
      p95LatencyMs: 50,
      errorRate: 0,
      timestamp: '2026-03-14T12:00:00.000Z',
      source: 'redis',
      degraded: false,
    });

    await service.record({ latencyMs: 50, statusCode: 200 });
    const result = await service.getSummary();

    expect(redisStore.record).toHaveBeenCalledWith({
      latencyMs: 50,
      statusCode: 200,
    });
    expect(inMemoryStore.record).not.toHaveBeenCalled();
    expect(result.source).toBe('redis');
  });

  it('should fall back to memory when Redis fails', async () => {
    redisStore.record.mockRejectedValue(new Error('redis down'));
    redisStore.getSummary.mockRejectedValue(new Error('redis down'));
    inMemoryStore.getSummary.mockResolvedValue({
      sampleSize: 1,
      p95LatencyMs: 90,
      errorRate: 100,
      timestamp: '2026-03-14T12:00:00.000Z',
      source: 'memory',
      degraded: false,
    });

    await service.record({ latencyMs: 90, statusCode: 500 });
    const result = await service.getSummary();

    expect(inMemoryStore.record).toHaveBeenCalledWith({
      latencyMs: 90,
      statusCode: 500,
    });
    expect(result).toMatchObject({
      source: 'memory',
      degraded: true,
    });
  });
});
