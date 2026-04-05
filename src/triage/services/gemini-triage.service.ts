import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiService } from '../../ai/ai.service';
import { RequestUser } from '../../common/interfaces/request-user.interface';
import {
  RedFlag,
  TriageAnswer,
  TriagePriority,
} from '../schemas/triage-session.schema';

type GeminiTriageResult = {
  basePriority: TriagePriority;
  aiSummary?: string;
};

@Injectable()
export class GeminiTriageService {
  private static readonly promptKey = 'triage.general_medicine.analyze';

  constructor(
    private readonly aiService: AiService,
    private readonly configService: ConfigService,
  ) {}

  async analyzeTriage(
    answers: TriageAnswer[],
    redFlags: RedFlag[],
    user: RequestUser,
    correlationId?: string,
  ): Promise<GeminiTriageResult> {
    const aiResponse = await this.aiService.generateText({
      promptKey: GeminiTriageService.promptKey,
      promptVersion: 1,
      model: this.configService.get<string>('ai.model') ?? 'gemini-2.5-flash',
      systemInstruction:
        'Eres un asistente de triage clinico. Responde solo JSON valido con las llaves priority y summary. priority debe ser LOW, MODERATE o HIGH. summary debe ser neutral, sin diagnostico, sin prescripcion y sin medicacion.',
      inputText: JSON.stringify({ answers, redFlags }),
      correlationId,
      actor: {
        actorId: user.userId,
        actorRole: user.role,
      },
    });

    const parsed = this.tryParseJson(aiResponse.text);

    if (!parsed || typeof parsed !== 'object') {
      return {
        basePriority: 'LOW',
        aiSummary: aiResponse.text?.trim() || undefined,
      };
    }

    const priority = this.normalizePriority(
      (parsed as Record<string, unknown>).priority,
    );
    const summary = (parsed as Record<string, unknown>).summary;

    return {
      basePriority: priority,
      aiSummary: typeof summary === 'string' ? summary : undefined,
    };
  }

  private normalizePriority(value: unknown): TriagePriority {
    if (value === 'HIGH' || value === 'MODERATE' || value === 'LOW') {
      return value;
    }

    return 'LOW';
  }

  private tryParseJson(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch {
      const first = value.indexOf('{');
      const last = value.lastIndexOf('}');
      if (first < 0 || last <= first) {
        return null;
      }

      try {
        return JSON.parse(value.slice(first, last + 1));
      } catch {
        return null;
      }
    }
  }
}
