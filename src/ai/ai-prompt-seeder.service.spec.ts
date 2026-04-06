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

  it('should seed prompt definition with configured model', async () => {
    configService.get.mockReturnValue('gemini-2.5-pro');
    const service = new AiPromptSeederService(
      promptDefinitionModel as never,
      configService as unknown as ConfigService,
    );

    await service.onApplicationBootstrap();
    const [, updatePayload, updateOptions] = promptDefinitionModel.updateOne
      .mock.calls[0] as [
      { key: string; version: number },
      {
        $set: {
          model: string;
          active: boolean;
        };
      },
      { upsert: boolean },
    ];

    expect(promptDefinitionModel.updateOne).toHaveBeenCalledWith(
      { key: 'gemini.connectivity.check', version: 1 },
      expect.any(Object),
      { upsert: true },
    );
    expect(updatePayload.$set.model).toBe('gemini-2.5-pro');
    expect(updatePayload.$set.active).toBe(true);
    expect(updateOptions.upsert).toBe(true);
  });

  it('should fallback to default model when config is missing', async () => {
    configService.get.mockReturnValue(undefined);
    const service = new AiPromptSeederService(
      promptDefinitionModel as never,
      configService as unknown as ConfigService,
    );

    await service.onApplicationBootstrap();
    const [, updatePayload, updateOptions] = promptDefinitionModel.updateOne
      .mock.calls[0] as [
      Record<string, unknown>,
      {
        $set: {
          model: string;
        };
      },
      { upsert: boolean },
    ];

    expect(promptDefinitionModel.updateOne).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      { upsert: true },
    );
    expect(updatePayload.$set.model).toBe('gemini-2.5-flash');
    expect(updateOptions.upsert).toBe(true);
  });
});
