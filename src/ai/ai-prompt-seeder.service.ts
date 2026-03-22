import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GEMINI_CONNECTIVITY_PROMPT_KEY } from './ai.constants';
import {
  AiPromptDefinition,
  AiPromptDefinitionDocument,
} from './schemas/ai-prompt-definition.schema';

@Injectable()
export class AiPromptSeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AiPromptSeederService.name);

  constructor(
    @InjectModel(AiPromptDefinition.name)
    private readonly promptDefinitionModel: Model<AiPromptDefinitionDocument>,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const model =
      this.configService.get<string>('ai.model') ?? 'gemini-2.5-flash';

    await this.promptDefinitionModel.updateOne(
      {
        key: GEMINI_CONNECTIVITY_PROMPT_KEY,
        version: 1,
      },
      {
        $set: {
          provider: 'gemini',
          model,
          active: true,
          systemInstruction:
            'You are a connectivity probe. Reply with a short healthy acknowledgement only.',
          metadata: {
            purpose: 'health-check',
          },
        },
      },
      { upsert: true },
    );

    this.logger.log(
      `Ensured prompt definition ${GEMINI_CONNECTIVITY_PROMPT_KEY}@1`,
    );
  }
}
