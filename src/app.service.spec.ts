import { getConnectionToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { AppService } from './app.service';

describe('AppService', () => {
  let appService: AppService;
  const connectionMock = {
    readyState: 1,
  };

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-14T12:00:00.000Z'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppService,
        {
          provide: getConnectionToken(),
          useValue: connectionMock,
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

  it('should return a ready payload when mongoose is connected', () => {
    connectionMock.readyState = 1;

    const result = appService.getReadiness();

    expect(result.status).toBe('ready');
    expect(result.checks.database.status).toBe('up');
    expect(result.checks.database.detail).toBe(
      'mongoose readyState: 1 (connected)',
    );
  });

  it('should return not_ready for unknown readyState', () => {
    connectionMock.readyState = 3;
    const result = appService.getReadiness();
    expect(result.status).toBe('not_ready');
    expect(result.checks.database.status).toBe('down');
    expect(result.checks.database.detail).toContain('mongoose readyState: 3');
  });

  it('should return a not ready payload when mongoose is disconnected', () => {
    connectionMock.readyState = 0;

    const result = appService.getReadiness();

    expect(result.status).toBe('not_ready');
    expect(result.checks.database.status).toBe('down');
    expect(result.checks.database.detail).toBe(
      'mongoose readyState: 0 (disconnected)',
    );
  });
});
