import { ConfigService } from '@nestjs/config';
import { AiPromptSeederService } from './ai-prompt-seeder.service';

describe('AiPromptSeederService', () => {
  let promptDefinitionModel: { updateOne: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(() => {
    promptDefinitionModel = {
      updateOne: jest.fn().mockResolvedValue({}),
    };
    configService = {
      get: jest.fn(),
    };
  });

  it('should seed connectivity check and triage prompts on bootstrap', async () => {
    configService.get.mockReturnValue('gemini-2.5-pro');
    const service = new AiPromptSeederService(
      promptDefinitionModel as never,
      configService as unknown as ConfigService,
    );

    await service.onApplicationBootstrap();

    // Called for connectivity check + 2 triage prompts
    expect(promptDefinitionModel.updateOne).toHaveBeenCalledTimes(3);
    expect(promptDefinitionModel.updateOne).toHaveBeenCalledWith(
      { key: 'gemini.connectivity.check', version: 1 },
      expect.any(Object),
      { upsert: true },
    );
    expect(promptDefinitionModel.updateOne).toHaveBeenCalledWith(
      { key: 'triage.general_medicine.analyze', version: 1 },
      expect.any(Object),
      { upsert: true },
    );
    expect(promptDefinitionModel.updateOne).toHaveBeenCalledWith(
      { key: 'triage.odontology.analyze', version: 1 },
      expect.any(Object),
      { upsert: true },
    );
  });

  it('should use $setOnInsert to avoid overwriting existing prompts', async () => {
    configService.get.mockReturnValue('gemini-2.5-pro');
    const service = new AiPromptSeederService(
      promptDefinitionModel as never,
      configService as unknown as ConfigService,
    );

    await service.onApplicationBootstrap();
    const [, updatePayload] = promptDefinitionModel.updateOne.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, Record<string, unknown>>,
      Record<string, unknown>,
    ];

    expect(updatePayload.$setOnInsert).toBeDefined();
    expect(updatePayload.$setOnInsert.model).toBe('gemini-2.5-pro');
    expect(updatePayload.$setOnInsert.active).toBe(true);
  });

  it('should fallback to default model when config is missing', async () => {
    configService.get.mockReturnValue(undefined);
    const service = new AiPromptSeederService(
      promptDefinitionModel as never,
      configService as unknown as ConfigService,
    );

    await service.onApplicationBootstrap();
    const [, updatePayload] = promptDefinitionModel.updateOne.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, Record<string, unknown>>,
      Record<string, unknown>,
    ];

    expect(updatePayload.$setOnInsert.model).toBe('gemini-2.5-flash');
  });
});
