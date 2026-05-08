import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiService } from '../../ai/ai.service';
import { Specialty } from '../../common/enums/specialty.enum';
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

type TriageAnswerInput = Pick<
  TriageAnswer,
  'questionId' | 'questionText' | 'answerValue'
>;

const FALLBACK_SYSTEM_INSTRUCTION =
  'Eres un asistente de triage clinico. Responde solo JSON valido con las llaves priority y summary. priority debe ser LOW, MODERATE o HIGH. summary debe ser neutral, sin diagnostico, sin prescripcion y sin medicacion.';

@Injectable()
export class GeminiTriageService {
  private readonly logger = new Logger(GeminiTriageService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly configService: ConfigService,
  ) {}

  async analyzeTriage(
    answers: TriageAnswerInput[],
    redFlags: RedFlag[],
    user: RequestUser,
    correlationId?: string,
    specialty: Specialty = Specialty.GENERAL_MEDICINE,
  ): Promise<GeminiTriageResult> {
    const promptKey = `triage.${specialty.toLowerCase()}.analyze`;
    const systemInstruction =
      (await this.aiService.getActivePromptInstruction(promptKey)) ??
      FALLBACK_SYSTEM_INSTRUCTION;

    if (systemInstruction === FALLBACK_SYSTEM_INSTRUCTION) {
      this.logger.warn(
        `No DB prompt found for key "${promptKey}" — using hardcoded fallback`,
      );
    }

    const aiResponse = await this.aiService.generateText({
      promptKey,
      promptVersion: 1,
      model: this.configService.get<string>('ai.model') ?? 'gemini-2.5-flash',
      systemInstruction,
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
