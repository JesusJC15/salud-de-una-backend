import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConsultationsService } from '../consultations/consultations.service';
import { Specialty } from '../common/enums/specialty.enum';
import { RequestUser } from '../common/interfaces/request-user.interface';
import { CreateTriageSessionDto } from './dto/create-triage-session.dto';
import { RedFlagsEngine } from './engines/red-flags.engine';
import { SaveTriageAnswersDto } from './dto/save-triage-answers.dto';
import { GeminiTriageService } from './services/gemini-triage.service';
import { GuardrailService } from './services/guardrail.service';
import {
  RedFlag,
  TriagePriority,
  TriageSession,
  TriageSessionDocument,
} from './schemas/triage-session.schema';
import {
  TriageQuestion,
  TriageQuestionsRepository,
} from './questions/triage-questions.repository';

type CreateTriageSessionResponse = {
  sessionId: string;
  specialty: string;
  status: string;
  questions: TriageQuestion[];
  totalQuestions: number;
  answeredCount: number;
  remainingQuestions: number;
  progressPercent: number;
  nextQuestionId: string | null;
  isComplete: boolean;
};

type SaveTriageAnswersResponse = {
  sessionId: string;
  answersCount: number;
  isComplete: boolean;
  totalQuestions: number;
  answeredCount: number;
  remainingQuestions: number;
  progressPercent: number;
  nextQuestionId: string | null;
};

type AnalyzeTriageSessionResponse = {
  sessionId: string;
  priority: TriagePriority;
  redFlags: RedFlag[];
  message: string;
  highPriorityAlert: boolean;
};

@Injectable()
export class TriageService {
  private readonly logger = new Logger(TriageService.name);

  constructor(
    @InjectModel(TriageSession.name)
    private readonly triageSessionModel: Model<TriageSessionDocument>,
    private readonly triageQuestionsRepository: TriageQuestionsRepository,
    private readonly guardrailService: GuardrailService,
    private readonly geminiTriageService: GeminiTriageService,
    private readonly consultationsService: ConsultationsService,
  ) {}

  async createSession(
    user: RequestUser,
    dto: CreateTriageSessionDto,
    correlationId?: string,
  ): Promise<CreateTriageSessionResponse> {
    if (!Types.ObjectId.isValid(user.userId)) {
      throw new BadRequestException('patientId invalido');
    }

    const patientId = new Types.ObjectId(user.userId);
    const existingSession = await this.triageSessionModel
      .findOne({
        patientId,
        specialty: dto.specialty,
        status: 'IN_PROGRESS',
      })
      .select('_id')
      .lean()
      .exec();

    if (existingSession) {
      throw new ConflictException(
        'Ya existe una sesion de triage en progreso para esta especialidad',
      );
    }

    const [createdSession] = await this.triageSessionModel.create([
      {
        patientId,
        specialty: dto.specialty,
        status: 'IN_PROGRESS',
      },
    ]);

    const questions = this.triageQuestionsRepository.getQuestionsBySpecialty(
      dto.specialty,
    );
    const progress = this.buildProgressState(dto.specialty, new Set<string>());

    this.logger.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        service: 'api',
        endpoint_or_event: 'triage.session.created',
        correlation_id: correlationId,
        user_id: user.userId,
        role: user.role,
        specialty: dto.specialty,
        triage_session_id: createdSession._id.toString(),
      }),
    );

    return {
      sessionId: createdSession._id.toString(),
      specialty: createdSession.specialty,
      status: createdSession.status,
      questions,
      totalQuestions: progress.totalQuestions,
      answeredCount: progress.answeredCount,
      remainingQuestions: progress.remainingQuestions,
      progressPercent: progress.progressPercent,
      nextQuestionId: progress.nextQuestionId,
      isComplete: progress.isComplete,
    };
  }

  async saveAnswers(
    sessionId: string,
    user: RequestUser,
    dto: SaveTriageAnswersDto,
    correlationId?: string,
  ): Promise<SaveTriageAnswersResponse> {
    if (!Types.ObjectId.isValid(sessionId)) {
      throw new NotFoundException('Sesion de triage no encontrada');
    }

    if (!Types.ObjectId.isValid(user.userId)) {
      throw new BadRequestException('patientId invalido');
    }

    const triageSession = await this.triageSessionModel
      .findOne({
        _id: new Types.ObjectId(sessionId),
        patientId: new Types.ObjectId(user.userId),
      })
      .exec();

    if (!triageSession) {
      throw new NotFoundException('Sesion de triage no encontrada');
    }

    if (triageSession.status !== 'IN_PROGRESS') {
      throw new BadRequestException('La sesion de triage no esta en progreso');
    }

    const invalidQuestionIds = dto.answers
      .map((answer) => answer.questionId)
      .filter(
        (questionId) =>
          !this.triageQuestionsRepository.isQuestionValid(
            triageSession.specialty,
            questionId,
          ),
      );

    if (invalidQuestionIds.length > 0) {
      throw new BadRequestException(
        `questionId invalido para la especialidad de la sesion: ${invalidQuestionIds.join(', ')}`,
      );
    }

    const answerMap = new Map(
      triageSession.answers.map((answer) => [answer.questionId, answer]),
    );

    for (const incomingAnswer of dto.answers) {
      const question = this.triageQuestionsRepository.getQuestionById(
        triageSession.specialty,
        incomingAnswer.questionId,
      );

      if (!question) {
        continue;
      }

      answerMap.set(incomingAnswer.questionId, {
        questionId: incomingAnswer.questionId,
        questionText: question.questionText,
        answerValue: incomingAnswer.answerValue,
        answeredAt: new Date(),
      });
    }

    const requiredQuestionIds =
      this.triageQuestionsRepository.getRequiredQuestionIds(
        triageSession.specialty,
      );

    triageSession.answers = requiredQuestionIds
      .filter((questionId) => answerMap.has(questionId))
      .map((questionId) => answerMap.get(questionId)!);

    await triageSession.save();

    const answeredQuestionIds = new Set(answerMap.keys());
    const progress = this.buildProgressState(
      triageSession.specialty,
      answeredQuestionIds,
    );

    this.logger.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        service: 'api',
        endpoint_or_event: 'triage.answers.saved',
        correlation_id: correlationId,
        user_id: user.userId,
        role: user.role,
        specialty: triageSession.specialty,
        triage_session_id: triageSession._id.toString(),
        answers_count: triageSession.answers.length,
        is_complete: progress.isComplete,
      }),
    );

    return {
      sessionId: triageSession._id.toString(),
      answersCount: triageSession.answers.length,
      isComplete: progress.isComplete,
      totalQuestions: progress.totalQuestions,
      answeredCount: progress.answeredCount,
      remainingQuestions: progress.remainingQuestions,
      progressPercent: progress.progressPercent,
      nextQuestionId: progress.nextQuestionId,
    };
  }

  async analyzeSession(
    sessionId: string,
    user: RequestUser,
    correlationId?: string,
  ): Promise<AnalyzeTriageSessionResponse> {
    const triageSession = await this.getOwnedInProgressSession(sessionId, user);

    if (!this.isSessionComplete(triageSession)) {
      throw new UnprocessableEntityException(
        'La sesion de triage no esta completa',
      );
    }

    const startedAt = Date.now();
    const redFlags = RedFlagsEngine.evaluate(
      triageSession.answers,
      triageSession.specialty,
    );

    let basePriority = this.getRuleBasedBasePriority(redFlags);
    let aiSummary: string | undefined;

    if (triageSession.specialty === Specialty.GENERAL_MEDICINE) {
      try {
        const aiResult = await this.geminiTriageService.analyzeTriage(
          triageSession.answers,
          redFlags,
          user,
          correlationId,
        );

        basePriority = aiResult.basePriority;
        aiSummary = aiResult.aiSummary;
      } catch (error: unknown) {
        const analysisDurationMs = Date.now() - startedAt;
        triageSession.status = 'FAILED';
        await triageSession.save();

        this.logger.error(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            level: 'error',
            service: 'api',
            endpoint_or_event: 'triage.analyze.failed',
            correlation_id: correlationId,
            user_id: user.userId,
            role: user.role,
            specialty: triageSession.specialty,
            triage_session_id: triageSession._id.toString(),
            latency_ms: analysisDurationMs,
            error_message:
              error instanceof Error ? error.message : String(error),
          }),
        );

        throw new ServiceUnavailableException(
          'No fue posible completar el analisis de triage en este momento',
        );
      }
    }

    const guardrailResult = this.guardrailService.check(aiSummary ?? '');
    const guardrailApplied = !guardrailResult.safe;
    if (guardrailApplied) {
      this.logger.warn(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'warn',
          service: 'api',
          endpoint_or_event: 'triage.guardrail.blocked',
          correlation_id: correlationId,
          user_id: user.userId,
          role: user.role,
          specialty: triageSession.specialty,
          triage_session_id: triageSession._id.toString(),
          violations: guardrailResult.violations,
        }),
      );
    }
    aiSummary = guardrailApplied ? undefined : aiSummary;

    const priority = this.resolveFinalPriority(basePriority, redFlags);
    const analysisDurationMs = Date.now() - startedAt;

    if (analysisDurationMs > 15_000) {
      this.logger.warn(
        `Triage analysis exceeded SLO: ${analysisDurationMs}ms | correlation_id=${correlationId}`,
      );
    }

    triageSession.analysis = {
      priority,
      redFlags,
      aiSummary,
      analysisDurationMs,
      guardrailApplied,
    };
    triageSession.status = 'COMPLETED';
    triageSession.completedAt = new Date();
    await triageSession.save();

    await this.consultationsService.createFromTriage({
      patientId: triageSession.patientId,
      triageSessionId: triageSession._id,
      specialty: triageSession.specialty,
      priority,
    });

    this.logger.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        service: 'api',
        endpoint_or_event: 'triage.analyze.completed',
        correlation_id: correlationId,
        user_id: user.userId,
        role: user.role,
        specialty: triageSession.specialty,
        triage_session_id: triageSession._id.toString(),
        priority,
        red_flags_count: redFlags.length,
        guardrail_applied: guardrailApplied,
        latency_ms: analysisDurationMs,
      }),
    );

    return {
      sessionId: triageSession._id.toString(),
      priority,
      redFlags,
      message:
        priority === 'HIGH'
          ? 'Se detectaron signos de alarma. Tu caso fue priorizado para atencion medica.'
          : 'Analisis de triage completado. Tu caso fue enviado a la cola medica.',
      highPriorityAlert: priority === 'HIGH',
    };
  }

  private async getOwnedInProgressSession(
    sessionId: string,
    user: RequestUser,
  ): Promise<TriageSessionDocument> {
    if (!Types.ObjectId.isValid(sessionId)) {
      throw new NotFoundException('Sesion de triage no encontrada');
    }

    if (!Types.ObjectId.isValid(user.userId)) {
      throw new BadRequestException('patientId invalido');
    }

    const triageSession = await this.triageSessionModel
      .findOne({
        _id: new Types.ObjectId(sessionId),
        patientId: new Types.ObjectId(user.userId),
      })
      .exec();

    if (!triageSession) {
      throw new NotFoundException('Sesion de triage no encontrada');
    }

    if (triageSession.status !== 'IN_PROGRESS') {
      throw new BadRequestException('La sesion de triage no esta en progreso');
    }

    return triageSession;
  }

  private isSessionComplete(triageSession: TriageSessionDocument): boolean {
    const requiredQuestionIds =
      this.triageQuestionsRepository.getRequiredQuestionIds(
        triageSession.specialty,
      );
    const answeredQuestionIds = new Set(
      triageSession.answers.map((answer) => answer.questionId),
    );

    return requiredQuestionIds.every((questionId) =>
      answeredQuestionIds.has(questionId),
    );
  }

  private buildProgressState(
    specialty: Specialty,
    answeredQuestionIds: Set<string>,
  ): {
    totalQuestions: number;
    answeredCount: number;
    remainingQuestions: number;
    progressPercent: number;
    nextQuestionId: string | null;
    isComplete: boolean;
  } {
    const requiredQuestionIds =
      this.triageQuestionsRepository.getRequiredQuestionIds(specialty);
    const totalQuestions = requiredQuestionIds.length;
    const answeredCount = requiredQuestionIds.filter((questionId) =>
      answeredQuestionIds.has(questionId),
    ).length;
    const remainingQuestions = Math.max(totalQuestions - answeredCount, 0);
    const progressPercent =
      totalQuestions === 0
        ? 0
        : Math.round((answeredCount / totalQuestions) * 100);
    const nextQuestionId =
      requiredQuestionIds.find(
        (questionId) => !answeredQuestionIds.has(questionId),
      ) ?? null;

    return {
      totalQuestions,
      answeredCount,
      remainingQuestions,
      progressPercent,
      nextQuestionId,
      isComplete: remainingQuestions === 0,
    };
  }

  private getRuleBasedBasePriority(redFlags: RedFlag[]): TriagePriority {
    if (redFlags.some((flag) => flag.severity === 'CRITICAL')) {
      return 'HIGH';
    }

    if (redFlags.some((flag) => flag.severity === 'WARNING')) {
      return 'MODERATE';
    }

    return 'LOW';
  }

  private resolveFinalPriority(
    basePriority: TriagePriority,
    redFlags: RedFlag[],
  ): TriagePriority {
    if (redFlags.some((flag) => flag.severity === 'CRITICAL')) {
      return 'HIGH';
    }

    if (
      redFlags.some((flag) => flag.severity === 'WARNING') &&
      basePriority === 'LOW'
    ) {
      return 'MODERATE';
    }

    return basePriority;
  }
}
