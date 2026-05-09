import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '../common/enums/user-role.enum';
import type { RequestContext } from '../common/interfaces/request-context.interface';
import { AiService } from './ai.service';
import { AdminAiController } from './admin-ai.controller';

const makeReq = (overrides: Partial<RequestContext> = {}): RequestContext =>
  ({
    user: {
      userId: 'admin-1',
      email: 'admin@example.com',
      role: UserRole.ADMIN,
      isActive: true,
    },
    correlationId: 'corr-test',
    ...overrides,
  }) as RequestContext;

describe('AdminAiController', () => {
  let controller: AdminAiController;
  let aiService: {
    healthCheck: jest.Mock;
    listPrompts: jest.Mock;
    getPromptVersions: jest.Mock;
    createPromptVersion: jest.Mock;
    togglePromptActive: jest.Mock;
  };

  beforeEach(async () => {
    aiService = {
      healthCheck: jest.fn().mockResolvedValue({ status: 'up' }),
      listPrompts: jest
        .fn()
        .mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 }),
      getPromptVersions: jest.fn().mockResolvedValue([]),
      createPromptVersion: jest
        .fn()
        .mockResolvedValue({ key: 'test.key', version: 2 }),
      togglePromptActive: jest.fn().mockResolvedValue({ active: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminAiController],
      providers: [{ provide: AiService, useValue: aiService }],
    }).compile();

    controller = module.get<AdminAiController>(AdminAiController);
  });

  it('healthCheck delegates to aiService', async () => {
    const req = makeReq();
    const result = await controller.healthCheck(req);
    expect(aiService.healthCheck).toHaveBeenCalledWith(
      req.user,
      req.correlationId,
    );
    expect(result).toEqual({ status: 'up' });
  });

  describe('listPrompts', () => {
    it('uses defaults when no query params', async () => {
      await controller.listPrompts();
      expect(aiService.listPrompts).toHaveBeenCalledWith(1, 20);
    });

    it('parses page and limit from query params', async () => {
      await controller.listPrompts('2', '5');
      expect(aiService.listPrompts).toHaveBeenCalledWith(2, 5);
    });
  });

  it('getPromptVersions delegates with key', async () => {
    const result = await controller.getPromptVersions(
      'triage.general_medicine.analyze',
    );
    expect(aiService.getPromptVersions).toHaveBeenCalledWith(
      'triage.general_medicine.analyze',
    );
    expect(result).toEqual([]);
  });

  it('createPromptVersion delegates DTO', async () => {
    const dto = { key: 'test.key', systemInstruction: 'You are helpful.' };
    const result = await controller.createPromptVersion(dto);
    expect(aiService.createPromptVersion).toHaveBeenCalledWith(dto);
    expect(result).toMatchObject({ key: 'test.key', version: 2 });
  });

  it('togglePromptActive delegates id and active flag', async () => {
    const result = await controller.togglePromptActive('some-id', {
      active: true,
    });
    expect(aiService.togglePromptActive).toHaveBeenCalledWith('some-id', true);
    expect(result).toMatchObject({ active: true });
  });
});
