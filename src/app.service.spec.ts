import { getConnectionToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { AppService } from './app.service';

describe('AppService', () => {
  let appService: AppService;
  const connectionMock = {
    readyState: 1,
  };

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

  it('should return a ready payload when mongoose is connected', () => {
    connectionMock.readyState = 1;

    const result = appService.getReadiness();

    expect(result.status).toBe('ready');
    expect(result.checks.database.status).toBe('up');
    expect(result.checks.database.detail).toBe(
      'mongoose readyState: 1 (connected)',
    );
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