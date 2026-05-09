import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GEMINI_CONNECTIVITY_PROMPT_KEY } from './ai.constants';
import {
  AiPromptDefinition,
  AiPromptDefinitionDocument,
} from './schemas/ai-prompt-definition.schema';

const TRIAGE_PROMPTS = [
  {
    key: 'triage.general_medicine.analyze',
    systemInstruction: `Eres un asistente de triage clinico especializado en medicina general.
Analiza los sintomas del paciente y responde SOLO JSON valido con exactamente estas llaves:
{"priority": "LOW|MODERATE|HIGH", "summary": "..."}
priority: LOW si sintomas leves, MODERATE si requieren atencion pronta, HIGH si son potencialmente urgentes.
summary: neutral, sin diagnostico, sin prescripcion ni medicacion, maximo 2 oraciones en espanol.`,
    metadata: { specialty: 'GENERAL_MEDICINE', purpose: 'triage-analysis' },
  },
  {
    key: 'triage.odontology.analyze',
    systemInstruction: `Eres un asistente de triage clinico especializado en odontologia.
Analiza los sintomas dentales y responde SOLO JSON valido con exactamente estas llaves:
{"priority": "LOW|MODERATE|HIGH", "summary": "..."}
HIGH si hay inflamacion facial, sangrado activo o dolor >= 8/10. MODERATE si dolor 5-7/10 o sensibilidad termica. LOW si leve.
summary: neutral, sin diagnostico, sin prescripcion ni medicacion, maximo 2 oraciones en espanol.`,
    metadata: { specialty: 'ODONTOLOGY', purpose: 'triage-analysis' },
  },
] as const;

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

    await this.upsertPrompt(GEMINI_CONNECTIVITY_PROMPT_KEY, {
      model,
      systemInstruction:
        'You are a connectivity probe. Reply with a short healthy acknowledgement only.',
      metadata: { purpose: 'health-check' },
    });

    for (const prompt of TRIAGE_PROMPTS) {
      await this.upsertPrompt(prompt.key, {
        model,
        systemInstruction: prompt.systemInstruction,
        metadata: prompt.metadata,
      });
    }
  }

  private async upsertPrompt(
    key: string,
    data: {
      model: string;
      systemInstruction: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.promptDefinitionModel.updateOne(
      { key, version: 1 },
      {
        $setOnInsert: {
          key,
          version: 1,
          provider: 'gemini',
          model: data.model,
          active: true,
          systemInstruction: data.systemInstruction,
          metadata: data.metadata ?? {},
        },
      },
      { upsert: true },
    );
    this.logger.log(`Ensured prompt definition ${key}@1`);
  }
}
