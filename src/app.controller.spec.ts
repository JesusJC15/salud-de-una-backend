import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health checks', () => {
    it('should return health payload', () => {
      const result = appController.getHealth();

      expect(result.status).toBe('ok');
      expect(result.service).toBe('salud-de-una-backend');
      expect(typeof result.uptimeSeconds).toBe('number');
      expect(typeof result.timestamp).toBe('string');
    });

    it('should return readiness payload', () => {
      const result = appController.getReadiness();

      expect(result.service).toBe('salud-de-una-backend');
      expect(['ready', 'not_ready']).toContain(result.status);
      expect(['up', 'down']).toContain(result.checks.database.status);
      expect(result.checks.database.detail).toContain('mongoose readyState');
    });
  });
});
