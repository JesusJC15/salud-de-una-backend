import { getConnectionToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from './ai/ai.service';
import { AppService } from './app.service';
import { RedisHealthService } from './redis/redis-health.service';

describe('AppService', () => {
  let appService: AppService;
  const connectionMock = {
    readyState: 1,
  };
  const redisHealthService = {
    getReadiness: jest.fn(),
  };
  const aiService = {
    getReadiness: jest.fn(),
  };

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-14T12:00:00.000Z'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(async () => {
    redisHealthService.getReadiness.mockResolvedValue({
      status: 'disabled',
      detail: 'Redis disabled',
      latencyMs: null,
      degraded: true,
    });
    aiService.getReadiness.mockReturnValue({
      status: 'disabled',
      detail: 'AI disabled',
      degraded: true,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppService,
        {
          provide: getConnectionToken(),
          useValue: connectionMock,
        },
        {
          provide: RedisHealthService,
          useValue: redisHealthService,
        },
        {
          provide: AiService,
          useValue: aiService,
        },
      ],
    }).compile();

    appService = module.get<AppService>(AppService);
  });

  it('should return health payload with correct values', () => {
    const result = appService.getHealth();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('salud-de-una-backend');
    expect(result.timestamp).toBe('2026-03-14T12:00:00.000Z');
    expect(typeof result.uptimeSeconds).toBe('number');
  });

  it('should return a ready payload when mongoose is connected', async () => {
    connectionMock.readyState = 1;

    const result = await appService.getReadiness();

    expect(result.status).toBe('ready');
    expect(result.checks.database.status).toBe('up');
    expect(result.checks.database.detail).toBe(
      'mongoose readyState: 1 (connected)',
    );
  });

  it('should return not_ready for unknown readyState', async () => {
    connectionMock.readyState = 3;
    const result = await appService.getReadiness();
    expect(result.status).toBe('not_ready');
    expect(result.checks.database.status).toBe('down');
    expect(result.checks.database.detail).toContain('mongoose readyState: 3');
  });

  it('should return a not ready payload when mongoose is disconnected', async () => {
    connectionMock.readyState = 0;

    const result = await appService.getReadiness();

    expect(result.status).toBe('not_ready');
    expect(result.checks.database.status).toBe('down');
    expect(result.checks.database.detail).toBe(
      'mongoose readyState: 0 (disconnected)',
    );
  });
});
