import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { GoogleGenAI } from '@google/genai';
import { AI_PROVIDER_TOKEN } from './ai.constants';
import { AdminAiController } from './admin-ai.controller';
import { GeminiAiProvider } from './gemini-ai.provider';
import { AiPromptSeederService } from './ai-prompt-seeder.service';
import { AiService } from './ai.service';
import { AiAuditLog, AiAuditLogSchema } from './schemas/ai-audit-log.schema';
import {
  AiPromptDefinition,
  AiPromptDefinitionSchema,
} from './schemas/ai-prompt-definition.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AiPromptDefinition.name, schema: AiPromptDefinitionSchema },
      { name: AiAuditLog.name, schema: AiAuditLogSchema },
    ]),
  ],
  controllers: [AdminAiController],
  providers: [
    {
      provide: GoogleGenAI,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const apiKey = configService.get<string>('ai.geminiApiKey');
        if (!apiKey) {
          return null;
        }

        return new GoogleGenAI({ apiKey });
      },
    },
    {
      provide: GeminiAiProvider,
      inject: [GoogleGenAI],
      useFactory: (client: GoogleGenAI | null) =>
        client ? new GeminiAiProvider(client) : null,
    },
    {
      provide: AI_PROVIDER_TOKEN,
      inject: [ConfigService, GeminiAiProvider],
      useFactory: (
        configService: ConfigService,
        geminiProvider: GeminiAiProvider | null,
      ) => {
        const provider = configService.get<string>('ai.provider') ?? 'gemini';
        const enabled = configService.get<boolean>('ai.enabled') === true;

        if (!enabled || provider !== 'gemini' || !geminiProvider) {
          return null;
        }

        return geminiProvider;
      },
    },
    AiPromptSeederService,
    AiService,
  ],
  exports: [AiService],
})
export class AiModule {}
