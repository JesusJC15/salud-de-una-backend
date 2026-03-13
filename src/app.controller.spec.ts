import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  const appServiceMock = {
    getHealth: jest.fn(),
    getReadiness: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: appServiceMock,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health checks', () => {
    it('should return health payload', () => {
      appServiceMock.getHealth.mockReturnValue({
        status: 'ok',
        service: 'salud-de-una-backend',
        uptimeSeconds: 1,
        timestamp: new Date().toISOString(),
      });

      const result = appController.getHealth();

      expect(appServiceMock.getHealth).toHaveBeenCalledTimes(1);
      expect(result.status).toBe('ok');
      expect(result.service).toBe('salud-de-una-backend');
      expect(typeof result.uptimeSeconds).toBe('number');
      expect(typeof result.timestamp).toBe('string');
    });

    it('should return readiness payload', () => {
      appServiceMock.getReadiness.mockReturnValue({
        status: 'ready',
        service: 'salud-de-una-backend',
        timestamp: new Date().toISOString(),
        checks: {
          database: {
            status: 'up',
            detail: 'mongoose readyState: 1 (connected)',
          },
        },
      });

      const result = appController.getReadiness();

      expect(appServiceMock.getReadiness).toHaveBeenCalledTimes(1);
      expect(result.service).toBe('salud-de-una-backend');
      expect(['ready', 'not_ready']).toContain(result.status);
      expect(['up', 'down']).toContain(result.checks.database.status);
      expect(result.checks.database.detail).toContain('mongoose readyState');
    });
  });
});
