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
  TriageSessionStatus,
} from './schemas/triage-session.schema';
import {
  TriageQuestion,
  TriageQuestionsRepository,
} from './questions/triage-questions.repository';

type CreateTriageSessionResponse = {
  sessionId: string;
  specialty: Specialty;
  status: TriageSessionStatus;
  questions: TriageQuestion[];
  totalQuestions: number;
  answeredCount: number;
  remainingQuestions: number;
  progressPercent: number;
  nextQuestionId: string | null;
  isComplete: boolean;
};

type ActiveTriageSessionResponse = {
  id: string;
  specialty: Specialty;
  status: TriageSessionStatus;
  currentStep: number;
  totalSteps: number;
  currentQuestionId: string | null;
  isComplete: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

type TriageSessionDetailResponse = {
  id: string;
  sessionId: string;
  specialty: Specialty;
  status: TriageSessionStatus;
  isComplete: boolean;
  currentQuestionId: string | null;
  currentStep: number;
  totalSteps: number;
  totalQuestions: number;
  nextQuestionId: string | null;
  questions: TriageQuestion[];
  createdAt: string | null;
  updatedAt: string | null;
};

type ListActiveTriageSessionsResponse = {
  items: ActiveTriageSessionResponse[];
  total: number;
};

type CancelTriageSessionResponse = {
  sessionId: string;
  specialty: Specialty;
  status: TriageSessionStatus;
  canceledAt: string;
  message: string;
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
  consultationId: string;
  priority: TriagePriority;
  redFlags: RedFlag[];
  message: string;
  highPriorityAlert: boolean;
  analysisMode?: 'AI_ASSISTED' | 'RULE_BASED';
  noticeCode?:
    | 'IA_TEMPORARILY_UNAVAILABLE_RULE_BASED_FALLBACK'
    | 'IA_NOT_IMPLEMENTED_RULE_BASED_FALLBACK';
};

const TRIAGE_ANALYSIS_ERROR_CODES = {
  DEPENDENCY_UNAVAILABLE: 'TRIAGE_ANALYSIS_DEPENDENCY_UNAVAILABLE',
  RULESET_MISSING: 'TRIAGE_ANALYSIS_RULESET_MISSING',
} as const;

const TRIAGE_ANALYSIS_AI_RETRY_BACKOFF_MS = [150, 400] as const;

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
    const existingSession = await this.findActiveSessionByPatientAndSpecialty(
      patientId,
      dto.specialty,
    );

    if (existingSession) {
      throw this.buildSessionInProgressConflict(
        dto.specialty,
        existingSession._id.toString(),
      );
    }

    let createdSession: TriageSessionDocument;
    try {
      [createdSession] = await this.triageSessionModel.create([
        {
          patientId,
          specialty: dto.specialty,
          status: 'IN_PROGRESS',
        },
      ]);
    } catch (error: unknown) {
      if (this.isMongoDuplicateKeyError(error)) {
        const duplicatedSession =
          await this.findActiveSessionByPatientAndSpecialty(
            patientId,
            dto.specialty,
          );

        if (duplicatedSession) {
          throw this.buildSessionInProgressConflict(
            dto.specialty,
            duplicatedSession._id.toString(),
          );
        }
      }

      throw error;
    }

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

  async getActiveSessions(
    user: RequestUser,
    specialty?: Specialty,
  ): Promise<ListActiveTriageSessionsResponse> {
    if (!Types.ObjectId.isValid(user.userId)) {
      throw new BadRequestException('patientId invalido');
    }

    const patientId = new Types.ObjectId(user.userId);
    const query = {
      patientId,
      status: 'IN_PROGRESS',
      ...(specialty ? { specialty } : {}),
    };

    const sessions = await this.triageSessionModel
      .find(query)
      .sort({ createdAt: -1 })
      .exec();

    const items = sessions.map((session) =>
      this.toActiveSessionSummary(session),
    );

    return {
      items,
      total: items.length,
    };
  }

  async getSessionDetail(
    sessionId: string,
    user: RequestUser,
  ): Promise<TriageSessionDetailResponse> {
    const triageSession = await this.getOwnedSession(sessionId, user);

    return this.toSessionDetailResponse(triageSession);
  }

  async cancelSession(
    sessionId: string,
    user: RequestUser,
    correlationId?: string,
  ): Promise<CancelTriageSessionResponse> {
    const triageSession = await this.getOwnedSession(sessionId, user);

    if (triageSession.status !== 'IN_PROGRESS') {
      throw new BadRequestException(
        'Solo se pueden cancelar sesiones en progreso',
      );
    }

    const canceledAt = new Date();
    triageSession.status = 'CANCELED';
    triageSession.canceledAt = canceledAt;
    await triageSession.save();

    this.logger.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        service: 'api',
        endpoint_or_event: 'triage.session.canceled',
        correlation_id: correlationId,
        user_id: user.userId,
        role: user.role,
        specialty: triageSession.specialty,
        triage_session_id: triageSession._id.toString(),
      }),
    );

    return {
      sessionId: triageSession._id.toString(),
      specialty: triageSession.specialty,
      status: triageSession.status,
      canceledAt: canceledAt.toISOString(),
      message: 'Sesion de triage cancelada correctamente',
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

    const requiredQuestionIds =
      this.triageQuestionsRepository.getRequiredQuestionIds(
        triageSession.specialty,
      );

    if (requiredQuestionIds.length === 0) {
      const analysisDurationMs = 0;
      triageSession.status = 'FAILED';
      await triageSession.save();

      this.logger.error(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'error',
          service: 'api',
          endpoint_or_event: 'triage.analyze.ruleset_missing',
          correlation_id: correlationId,
          user_id: user.userId,
          role: user.role,
          specialty: triageSession.specialty,
          session_id: triageSession._id.toString(),
          triage_session_id: triageSession._id.toString(),
          latency_ms: analysisDurationMs,
          error_code: TRIAGE_ANALYSIS_ERROR_CODES.RULESET_MISSING,
        }),
      );

      throw new ServiceUnavailableException({
        error: 'TriageAnalysisRulesetMissing',
        errorCode: TRIAGE_ANALYSIS_ERROR_CODES.RULESET_MISSING,
        specialty: triageSession.specialty,
        sessionId: triageSession._id.toString(),
        message:
          'No fue posible completar el analisis de triage en este momento',
      });
    }

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
    let aiStrategy:
      | 'provider'
      | 'fallback_rule_based'
      | 'fallback_rule_based_no_ai'
      | 'not_applicable' = 'not_applicable';
    let aiAttempts = 0;

    if (triageSession.specialty === Specialty.GENERAL_MEDICINE) {
      try {
        const aiResult = await this.analyzeGeneralMedicineWithResilience(
          triageSession.answers,
          redFlags,
          user,
          correlationId,
          triageSession._id.toString(),
        );

        basePriority = aiResult.basePriority;
        aiSummary = aiResult.aiSummary;
        aiStrategy = aiResult.strategy;
        aiAttempts = aiResult.attempts;
      } catch (error: unknown) {
        const analysisDurationMs = Date.now() - startedAt;
        triageSession.status = 'FAILED';
        await triageSession.save();

        const normalizedError = this.normalizeError(error);

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
            session_id: triageSession._id.toString(),
            triage_session_id: triageSession._id.toString(),
            latency_ms: analysisDurationMs,
            error_code: TRIAGE_ANALYSIS_ERROR_CODES.DEPENDENCY_UNAVAILABLE,
            error_name: normalizedError.name,
            error_message: normalizedError.message,
            error_stack: normalizedError.stack,
          }),
        );

        throw new ServiceUnavailableException({
          error: 'TriageAnalysisDependencyUnavailable',
          errorCode: TRIAGE_ANALYSIS_ERROR_CODES.DEPENDENCY_UNAVAILABLE,
          specialty: triageSession.specialty,
          sessionId: triageSession._id.toString(),
          message:
            'No fue posible completar el analisis de triage en este momento',
        });
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

    const consultationId = await this.consultationsService.createFromTriage({
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
        session_id: triageSession._id.toString(),
        triage_session_id: triageSession._id.toString(),
        priority,
        red_flags_count: redFlags.length,
        ai_strategy: aiStrategy,
        ai_attempts: aiAttempts,
        guardrail_applied: guardrailApplied,
        latency_ms: analysisDurationMs,
      }),
    );

    let message =
      priority === 'HIGH'
        ? 'Se detectaron signos de alarma. Tu caso fue priorizado para atencion medica.'
        : 'Analisis de triage completado. Tu caso fue enviado a la cola medica.';
    let noticeCode: AnalyzeTriageSessionResponse['noticeCode'];

    if (aiStrategy === 'fallback_rule_based') {
      message =
        priority === 'HIGH'
          ? 'Se detectaron signos de alarma. Tu caso fue priorizado para atencion medica. Se aplico analisis por reglas clinicas por indisponibilidad temporal de IA.'
          : 'Analisis de triage completado con reglas clinicas por indisponibilidad temporal de IA. Tu caso fue enviado a la cola medica.';
      noticeCode = 'IA_TEMPORARILY_UNAVAILABLE_RULE_BASED_FALLBACK';
    }

    if (aiStrategy === 'fallback_rule_based_no_ai') {
      message =
        priority === 'HIGH'
          ? 'Se detectaron signos de alarma. Tu caso fue priorizado para atencion medica. Analisis realizado con reglas clinicas porque la IA no esta implementada en este entorno.'
          : 'Analisis de triage completado con reglas clinicas porque la IA no esta implementada en este entorno. Tu caso fue enviado a la cola medica.';
      noticeCode = 'IA_NOT_IMPLEMENTED_RULE_BASED_FALLBACK';
    }

    return {
      sessionId: triageSession._id.toString(),
      consultationId,
      priority,
      redFlags,
      message,
      highPriorityAlert: priority === 'HIGH',
      analysisMode: aiStrategy === 'provider' ? 'AI_ASSISTED' : 'RULE_BASED',
      noticeCode,
    };
  }

  private async analyzeGeneralMedicineWithResilience(
    answers: {
      questionId: string;
      questionText: string;
      answerValue: unknown;
    }[],
    redFlags: RedFlag[],
    user: RequestUser,
    correlationId: string | undefined,
    sessionId: string,
  ): Promise<{
    basePriority: TriagePriority;
    aiSummary?: string;
    strategy: 'provider' | 'fallback_rule_based' | 'fallback_rule_based_no_ai';
    attempts: number;
  }> {
    let lastError: unknown;

    for (
      let attempt = 1;
      attempt <= TRIAGE_ANALYSIS_AI_RETRY_BACKOFF_MS.length + 1;
      attempt += 1
    ) {
      try {
        const aiResult = await this.geminiTriageService.analyzeTriage(
          answers,
          redFlags,
          user,
          correlationId,
        );

        return {
          basePriority: aiResult.basePriority,
          aiSummary: aiResult.aiSummary,
          strategy: 'provider',
          attempts: attempt,
        };
      } catch (error: unknown) {
        lastError = error;

        const shouldRetry =
          attempt <= TRIAGE_ANALYSIS_AI_RETRY_BACKOFF_MS.length &&
          this.isTransientAiError(error);

        if (shouldRetry) {
          const backoffMs = TRIAGE_ANALYSIS_AI_RETRY_BACKOFF_MS[attempt - 1];
          const normalizedError = this.normalizeError(error);

          this.logger.warn(
            JSON.stringify({
              timestamp: new Date().toISOString(),
              level: 'warn',
              service: 'api',
              endpoint_or_event: 'triage.analyze.retry',
              correlation_id: correlationId,
              user_id: user.userId,
              role: user.role,
              specialty: Specialty.GENERAL_MEDICINE,
              session_id: sessionId,
              triage_session_id: sessionId,
              attempt,
              backoff_ms: backoffMs,
              error_name: normalizedError.name,
              error_message: normalizedError.message,
            }),
          );

          await this.wait(backoffMs);
          continue;
        }

        break;
      }
    }

    if (
      lastError &&
      (this.isTransientAiError(lastError) ||
        this.isAiUnavailableByDesign(lastError))
    ) {
      const fallbackPriority = this.getRuleBasedBasePriority(redFlags);
      const normalizedError = this.normalizeError(lastError);
      const fallbackForNoAi = this.isAiUnavailableByDesign(lastError);

      this.logger.warn(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'warn',
          service: 'api',
          endpoint_or_event: 'triage.analyze.fallback_applied',
          correlation_id: correlationId,
          user_id: user.userId,
          role: user.role,
          specialty: Specialty.GENERAL_MEDICINE,
          session_id: sessionId,
          triage_session_id: sessionId,
          attempts: TRIAGE_ANALYSIS_AI_RETRY_BACKOFF_MS.length + 1,
          fallback_mode: fallbackForNoAi
            ? 'IA_NOT_IMPLEMENTED'
            : 'TEMPORARY_UNAVAILABLE',
          fallback_priority: fallbackPriority,
          reason: normalizedError.message,
        }),
      );

      return {
        basePriority: fallbackPriority,
        aiSummary: undefined,
        strategy: fallbackForNoAi
          ? 'fallback_rule_based_no_ai'
          : 'fallback_rule_based',
        attempts: TRIAGE_ANALYSIS_AI_RETRY_BACKOFF_MS.length + 1,
      };
    }

    throw lastError;
  }

  private isTransientAiError(error: unknown): boolean {
    const normalizedError = this.normalizeError(error);
    const signal =
      `${normalizedError.name} ${normalizedError.message}`.toLowerCase();

    return [
      'timeout',
      'timed out',
      'etimedout',
      'econnreset',
      'econnrefused',
      'network',
      'socket hang up',
      '429',
      'rate limit',
      'unavailable',
      'temporarily',
      'gateway',
    ].some((keyword) => signal.includes(keyword));
  }

  private isAiUnavailableByDesign(error: unknown): boolean {
    const normalizedError = this.normalizeError(error);
    const signal =
      `${normalizedError.name} ${normalizedError.message}`.toLowerCase();

    return [
      'ai provider is disabled',
      'provider configuration is incomplete',
      'gemini_api_key',
      'api key',
      'ai is disabled',
      'not implemented',
    ].some((keyword) => signal.includes(keyword));
  }

  private normalizeError(error: unknown): {
    name: string;
    message: string;
    stack?: string;
  } {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    return {
      name: 'UnknownError',
      message: String(error),
    };
  }

  private async wait(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async getOwnedInProgressSession(
    sessionId: string,
    user: RequestUser,
  ): Promise<TriageSessionDocument> {
    const triageSession = await this.getOwnedSession(sessionId, user);

    if (triageSession.status !== 'IN_PROGRESS') {
      throw new BadRequestException('La sesion de triage no esta en progreso');
    }

    return triageSession;
  }

  private async getOwnedSession(
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

    return triageSession;
  }

  private toActiveSessionSummary(
    triageSession: TriageSessionDocument,
  ): ActiveTriageSessionResponse {
    const answeredQuestionIds = new Set(
      triageSession.answers.map((answer) => answer.questionId),
    );
    const progress = this.buildProgressState(
      triageSession.specialty,
      answeredQuestionIds,
    );
    const currentStep = this.buildCurrentStep(progress);

    return {
      id: triageSession._id.toString(),
      specialty: triageSession.specialty,
      status: triageSession.status,
      currentStep,
      totalSteps: progress.totalQuestions,
      currentQuestionId: progress.nextQuestionId,
      isComplete: progress.isComplete,
      createdAt: triageSession.createdAt?.toISOString() ?? null,
      updatedAt: triageSession.updatedAt?.toISOString() ?? null,
    };
  }

  private toSessionDetailResponse(
    triageSession: TriageSessionDocument,
  ): TriageSessionDetailResponse {
    const answeredQuestionIds = new Set(
      triageSession.answers.map((answer) => answer.questionId),
    );
    const progress = this.buildProgressState(
      triageSession.specialty,
      answeredQuestionIds,
    );
    const sessionId = triageSession._id.toString();

    return {
      id: sessionId,
      sessionId,
      specialty: triageSession.specialty,
      status: triageSession.status,
      isComplete: progress.isComplete,
      currentQuestionId: progress.nextQuestionId,
      currentStep: this.buildCurrentStep(progress),
      totalSteps: progress.totalQuestions,
      totalQuestions: progress.totalQuestions,
      nextQuestionId: progress.nextQuestionId,
      questions: this.triageQuestionsRepository.getQuestionsBySpecialty(
        triageSession.specialty,
      ),
      createdAt: triageSession.createdAt?.toISOString() ?? null,
      updatedAt: triageSession.updatedAt?.toISOString() ?? null,
    };
  }

  private buildCurrentStep(progress: {
    totalQuestions: number;
    answeredCount: number;
    isComplete: boolean;
  }): number {
    const nextStepIncrement = progress.isComplete ? 0 : 1;

    return progress.totalQuestions === 0
      ? 0
      : Math.min(
          progress.answeredCount + nextStepIncrement,
          progress.totalQuestions,
        );
  }

  private async findActiveSessionByPatientAndSpecialty(
    patientId: Types.ObjectId,
    specialty: Specialty,
  ): Promise<{ _id: Types.ObjectId } | null> {
    return this.triageSessionModel
      .findOne({
        patientId,
        specialty,
        status: 'IN_PROGRESS',
      })
      .select('_id')
      .lean()
      .exec();
  }

  private buildSessionInProgressConflict(
    specialty: Specialty,
    existingSessionId: string,
  ): ConflictException {
    return new ConflictException({
      error: 'TriageSessionInProgress',
      errorCode: 'TRIAGE_SESSION_IN_PROGRESS',
      specialty,
      existingSessionId,
      status: 'IN_PROGRESS',
      message:
        'Ya existe una sesion de triage en progreso para esta especialidad',
    });
  }

  private isMongoDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 11000
    );
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
