import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { AiService } from '../ai/ai.service';
import { ChatService } from '../chat/chat.service';
import { DoctorAvailability } from '../common/enums/doctor-availability.enum';
import { DoctorStatus } from '../common/enums/doctor-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { RequestUser } from '../common/interfaces/request-user.interface';
import { OutboxDispatcherService } from '../outbox/outbox-dispatcher.service';
import { OutboxService } from '../outbox/outbox.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Patient, PatientDocument } from '../patients/schemas/patient.schema';
import { RagService } from '../rag/rag.service';
import {
  TriageSession,
  TriageSessionDocument,
} from '../triage/schemas/triage-session.schema';
import { CloseConsultationDto } from './dto/close-consultation.dto';
import { ListConsultationsHistoryDto } from './dto/list-consultations-history.dto';
import { RateConsultationDto } from './dto/rate-consultation.dto';
import { SummaryFeedbackDto } from './dto/summary-feedback.dto';
import { Specialty } from '../common/enums/specialty.enum';
import { TriagePriority } from '../triage/schemas/triage-session.schema';
import { Doctor, DoctorDocument } from '../doctors/schemas/doctor.schema';
import {
  Consultation,
  ConsultationDocument,
  type ConsultationStatus,
} from './schemas/consultation.schema';

type CreateConsultationFromTriageInput = {
  patientId: string | Types.ObjectId;
  triageSessionId: string | Types.ObjectId;
  specialty: Specialty;
  priority: TriagePriority;
};

type QueueRow = {
  _id: Types.ObjectId;
  patientId: Types.ObjectId;
  triageSessionId: Types.ObjectId;
  specialty: Specialty;
  priority: TriagePriority;
  status: string;
  createdAt: Date | null;
};

const CLINICAL_SUMMARY_SYSTEM_INSTRUCTION =
  'Eres un asistente médico clínico. Dado el resultado de un triage, genera un resumen ' +
  'clínico conciso (máximo 200 palabras) para el médico que va a atender al paciente. ' +
  'Incluye: síntoma principal, duración, intensidad, signos de alarma detectados y ' +
  'prioridad asignada. Usa lenguaje médico profesional en español. No hagas diagnósticos ' +
  'ni recomendaciones de tratamiento.';

const CONSULTATION_PENDING: ConsultationStatus = 'PENDING';
const CONSULTATION_IN_ATTENTION: ConsultationStatus = 'IN_ATTENTION';
const CONSULTATION_CLOSED: ConsultationStatus = 'CLOSED';

@Injectable()
export class ConsultationsService {
  private readonly logger = new Logger(ConsultationsService.name);

  constructor(
    @InjectConnection()
    @Optional()
    private readonly connection: Connection | null,
    @InjectModel(Consultation.name)
    private readonly consultationModel: Model<ConsultationDocument>,
    @InjectModel(Doctor.name)
    private readonly doctorModel: Model<DoctorDocument>,
    @InjectModel(Patient.name)
    private readonly patientModel: Model<PatientDocument>,
    @InjectModel(TriageSession.name)
    private readonly triageSessionModel: Model<TriageSessionDocument>,
    private readonly aiService: AiService,
    private readonly notificationsService: NotificationsService,
    private readonly outboxService: OutboxService,
    @Inject(forwardRef(() => OutboxDispatcherService))
    private readonly outboxDispatcherService: OutboxDispatcherService,
    private readonly chatService: ChatService,
    private readonly ragService: RagService,
    @Optional()
    private readonly configService?: ConfigService,
  ) {}

  async createFromTriage(
    input: CreateConsultationFromTriageInput,
    session?: ClientSession,
  ): Promise<string> {
    const [doc] = await this.consultationModel.create(
      [
        {
          patientId: this.toObjectId(input.patientId),
          triageSessionId: this.toObjectId(input.triageSessionId),
          specialty: input.specialty,
          priority: input.priority,
          status: 'PENDING',
        },
      ],
      session ? { session } : undefined,
    );

    return doc._id.toString();
  }

  async createFollowupEscalationConsultation(input: {
    patientId: string | Types.ObjectId;
    triageSessionId: string | Types.ObjectId;
    specialty: Specialty;
    priority: TriagePriority;
    sourceFollowupId: Types.ObjectId;
  }) {
    const [consultation] = await this.consultationModel.create([
      {
        patientId: this.toObjectId(input.patientId),
        triageSessionId: this.toObjectId(input.triageSessionId),
        specialty: input.specialty,
        priority: input.priority,
        status: 'PENDING',
        sourceFollowupId: input.sourceFollowupId,
      },
    ]);

    return consultation;
  }

  async getQueue(options: { limit?: number; page?: number } = {}) {
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 100);
    const page = Math.max(options.page ?? 1, 1);
    const skip = (page - 1) * limit;

    const queueRows = (await this.consultationModel
      .find({ status: 'PENDING' })
      .select(
        '_id patientId triageSessionId specialty priority status createdAt',
      )
      .lean()
      .exec()) as QueueRow[];

    const priorityRank = (priority: string): number => {
      switch (priority) {
        case 'HIGH':
          return 0;
        case 'MODERATE':
          return 1;
        case 'LOW':
          return 2;
        default:
          return 3;
      }
    };

    const paginatedRows = queueRows
      .slice()
      .sort((left, right) => {
        const rankDiff =
          priorityRank(left.priority) - priorityRank(right.priority);
        if (rankDiff !== 0) {
          return rankDiff;
        }

        if (left.createdAt && right.createdAt) {
          return left.createdAt.getTime() - right.createdAt.getTime();
        }

        if (left.createdAt) {
          return -1;
        }

        if (right.createdAt) {
          return 1;
        }

        return 0;
      })
      .slice(skip, skip + limit);

    const items = paginatedRows.map((row) => ({
      id: row._id.toString(),
      patientId: row.patientId.toString(),
      triageSessionId: row.triageSessionId.toString(),
      specialty: row.specialty,
      priority: row.priority,
      status: row.status,
      createdAt: row.createdAt,
    }));

    return { items };
  }

  async getById(consultationId: string, user: RequestUser) {
    const consultation = await this.findOwnedOrAccessibleConsultation(
      consultationId,
      user,
    );
    const triage = await this.triageSessionModel
      .findById(consultation.triageSessionId)
      .select('status answers analysis')
      .lean()
      .exec();

    return {
      id: consultation._id.toString(),
      patientId: consultation.patientId.toString(),
      triageSessionId: consultation.triageSessionId.toString(),
      specialty: consultation.specialty,
      priority: consultation.priority,
      status: consultation.status,
      assignedDoctorId: consultation.assignedDoctorId?.toString(),
      clinicalSummary: consultation.clinicalSummary,
      clinicalSummaryTraceId: consultation.clinicalSummaryTraceId ?? null,
      clinicalSummaryCitations:
        consultation.clinicalSummaryCitations?.map((citation) => ({
          chunkId: citation.chunkId,
          documentId: citation.documentId,
          title: citation.title,
          sectionPath: citation.sectionPath ?? null,
          authority: citation.authority,
          snippet: citation.snippet ?? null,
          score: citation.score,
        })) ?? [],
      closedAt: consultation.closedAt?.toISOString(),
      updatedAt: consultation.updatedAt?.toISOString(),
      triage: triage
        ? {
            status: triage.status,
            answers: triage.answers?.map((answer) => ({
              questionId: answer.questionId,
              questionText: answer.questionText,
              answerValue: answer.answerValue,
            })),
            analysis: triage.analysis
              ? {
                  priority: triage.analysis.priority,
                  redFlags: triage.analysis.redFlags,
                  aiSummary: triage.analysis.aiSummary,
                }
              : null,
          }
        : null,
      summaryFeedback: consultation.summaryFeedback
        ? {
            value: consultation.summaryFeedback.value,
            comment: consultation.summaryFeedback.comment ?? null,
            createdAt: consultation.summaryFeedback.createdAt.toISOString(),
          }
        : null,
    };
  }

  async assign(consultationId: string, user: RequestUser) {
    if (!Types.ObjectId.isValid(user.userId)) {
      throw new BadRequestException('doctorId invalido');
    }

    const doctor = await this.doctorModel
      .findById(user.userId)
      .select('doctorStatus availabilityStatus')
      .lean()
      .exec();

    if (!doctor || doctor.doctorStatus !== DoctorStatus.VERIFIED) {
      throw new ForbiddenException(
        'Acceso restringido: verificacion pendiente',
      );
    }

    if (doctor.availabilityStatus === DoctorAvailability.PAUSED) {
      throw new ForbiddenException('Debes reanudar tu disponibilidad');
    }

    const consultation = await this.consultationModel
      .findById(consultationId)
      .exec();
    if (!consultation) {
      throw new NotFoundException('Consulta no encontrada');
    }

    if (consultation.status !== CONSULTATION_PENDING) {
      throw new BadRequestException(
        'Solo se pueden asignar consultas pendientes',
      );
    }

    consultation.status = CONSULTATION_IN_ATTENTION;
    consultation.assignedDoctorId = new Types.ObjectId(user.userId);
    consultation.assignedAt = new Date();
    await consultation.save();

    await this.notificationsService.createUserNotification({
      userId: consultation.patientId.toString(),
      type: 'CONSULTATION_ASSIGNED',
      status: consultation.status,
      message: 'Un médico está atendiendo tu consulta ahora.',
      resourceId: consultation.id,
      deepLink: `/triage/chat/${consultation.id}`,
      metadata: {
        consultationId: consultation.id,
      },
    });

    return {
      id: consultation.id,
      status: consultation.status,
      assignedDoctorId: consultation.assignedDoctorId.toString(),
      updatedAt:
        consultation.updatedAt?.toISOString() ?? new Date().toISOString(),
    };
  }

  async close(
    consultationId: string,
    user: RequestUser,
    dto: CloseConsultationDto,
    correlationId?: string,
  ) {
    if (!this.connection) {
      return this.closeWithoutTransaction(
        consultationId,
        user,
        dto,
        correlationId,
      );
    }
    const session = await this.connection.startSession();
    let closedConsultationId = '';
    let closedConsultationPatientId = '';
    let closedConsultationStatus: ConsultationStatus = CONSULTATION_CLOSED;
    let closedConsultationAtIso = '';
    try {
      await session.withTransaction(async () => {
        const consultation = await this.consultationModel
          .findById(consultationId)
          .session(session)
          .exec();
        if (!consultation) {
          throw new NotFoundException('Consulta no encontrada');
        }

        this.assertAssignedDoctor(consultation, user);

        if (consultation.status !== CONSULTATION_IN_ATTENTION) {
          throw new BadRequestException(
            'Solo se pueden cerrar consultas en atencion',
          );
        }

        consultation.status = CONSULTATION_CLOSED;
        consultation.closedAt = new Date();
        if (dto.baselineSymptomSeverity !== undefined) {
          consultation.baselineSymptomSeverity = dto.baselineSymptomSeverity;
        }
        if (dto.redFlagsConfirmed !== undefined) {
          consultation.redFlagsConfirmed = dto.redFlagsConfirmed;
        }
        await consultation.save({ session });

        await this.outboxService.createConsultationClosedEvent(
          {
            consultationId: consultation.id,
          },
          correlationId,
          session,
        );

        closedConsultationId = consultation.id;
        closedConsultationPatientId = consultation.patientId.toString();
        closedConsultationStatus = consultation.status;
        closedConsultationAtIso = consultation.closedAt.toISOString();
      });
    } finally {
      await session.endSession();
    }

    if (!closedConsultationAtIso || !closedConsultationId) {
      throw new NotFoundException('Consulta no encontrada');
    }

    try {
      await this.notificationsService.createUserNotification({
        userId: closedConsultationPatientId,
        type: 'CONSULTATION_CLOSED',
        status: closedConsultationStatus,
        message: 'Tu consulta finalizó. Puedes calificar la atención recibida.',
        resourceId: closedConsultationId,
        deepLink: `/consultations/${closedConsultationId}`,
        sourceEventId: `consultation-closed:${closedConsultationId}`,
        metadata: {
          consultationId: closedConsultationId,
        },
      });
    } catch (error: unknown) {
      this.logger.warn(
        `No fue posible crear la notificacion de cierre para ${closedConsultationId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    await this.outboxDispatcherService.dispatchPendingEvents();

    return {
      id: closedConsultationId,
      status: closedConsultationStatus,
      closedAt: closedConsultationAtIso,
    };
  }

  async generateSummary(consultationId: string, user: RequestUser) {
    const consultation = await this.consultationModel
      .findById(consultationId)
      .exec();
    if (!consultation) {
      throw new NotFoundException('Consulta no encontrada');
    }

    this.assertAssignedDoctor(consultation, user);

    const triageSession = await this.triageSessionModel
      .findById(consultation.triageSessionId)
      .select('specialty answers analysis')
      .lean()
      .exec();

    if (!triageSession) {
      throw new NotFoundException('Triage asociado no encontrado');
    }

    const answersText = triageSession.answers
      .map(
        (answer) =>
          `Pregunta: ${answer.questionText}\nRespuesta: ${this.formatAnswerValue(answer.answerValue)}`,
      )
      .join('\n\n');

    const redFlagsText = triageSession.analysis?.redFlags?.length
      ? `\nSignos de alarma detectados:\n${triageSession.analysis.redFlags
          .map((redFlag) => `- [${redFlag.severity}] ${redFlag.evidence}`)
          .join('\n')}`
      : '\nNo se detectaron signos de alarma.';

    const inputText =
      `Especialidad: ${triageSession.specialty}\n` +
      `Prioridad asignada: ${triageSession.analysis?.priority ?? consultation.priority}\n\n` +
      `Respuestas del triage:\n${answersText}` +
      redFlagsText;

    try {
      if (this.isRagSummaryEnabled()) {
        const ragResult = await this.ragService.buildConsultationSummary({
          specialty: triageSession.specialty,
          query: inputText,
          audience: 'STAFF',
        });

        consultation.clinicalSummary = ragResult.answer?.trim() ?? '';
        consultation.clinicalSummaryTraceId = ragResult.traceId;
        consultation.clinicalSummaryCitations = ragResult.citations.map(
          (citation) => ({
            chunkId: citation.chunkId,
            documentId: citation.documentId,
            title: citation.title,
            sectionPath: citation.sectionPath,
            authority: citation.authority,
            snippet: citation.snippet,
            score: citation.score,
          }),
        );
      } else {
        const result = await this.aiService.generateText({
          promptKey: 'CLINICAL_SUMMARY_V1',
          promptVersion: 1,
          model: 'gemini-2.5-flash',
          systemInstruction: CLINICAL_SUMMARY_SYSTEM_INSTRUCTION,
          inputText,
          correlationId: randomUUID(),
        });

        consultation.clinicalSummary = result.text?.trim() ?? '';
        consultation.clinicalSummaryTraceId = undefined;
        consultation.clinicalSummaryCitations = [];
      }
    } catch {
      const summaryLines = [
        `Especialidad: ${triageSession.specialty}`,
        `Prioridad: ${triageSession.analysis?.priority ?? consultation.priority}`,
        triageSession.analysis?.aiSummary
          ? `Resumen IA: ${triageSession.analysis.aiSummary}`
          : null,
        triageSession.answers.length > 0
          ? `Motivo principal: ${this.formatAnswerValue(triageSession.answers[0]?.answerValue)}`
          : null,
      ].filter(Boolean);

      consultation.clinicalSummary = summaryLines.join('\n');
      consultation.clinicalSummaryTraceId = undefined;
      consultation.clinicalSummaryCitations = [];
      if (!consultation.clinicalSummary) {
        throw new ServiceUnavailableException(
          'No fue posible generar el resumen clínico en este momento',
        );
      }
    }

    await consultation.save();

    return {
      consultationId: consultation.id,
      summary: consultation.clinicalSummary,
      traceId: consultation.clinicalSummaryTraceId ?? null,
      citations:
        consultation.clinicalSummaryCitations?.map((citation) => ({
          chunkId: citation.chunkId,
          documentId: citation.documentId,
          title: citation.title,
          sectionPath: citation.sectionPath ?? null,
          authority: citation.authority,
          snippet: citation.snippet ?? null,
          score: citation.score,
        })) ?? [],
      generatedAt:
        consultation.updatedAt?.toISOString() ?? new Date().toISOString(),
    };
  }

  async submitSummaryFeedback(
    consultationId: string,
    user: RequestUser,
    dto: SummaryFeedbackDto,
  ) {
    const consultation = await this.consultationModel
      .findById(consultationId)
      .exec();
    if (!consultation) {
      throw new NotFoundException('Consulta no encontrada');
    }

    this.assertAssignedDoctor(consultation, user);

    consultation.summaryFeedback = {
      value: dto.value,
      comment: dto.comment,
      createdBy: user.userId,
      createdAt: new Date(),
    };
    await consultation.save();

    return {
      id: consultation.id,
      summaryFeedback: {
        value: consultation.summaryFeedback.value,
        comment: consultation.summaryFeedback.comment ?? null,
      },
    };
  }

  async getMessages(consultationId: string, user: RequestUser, limit?: number) {
    return this.chatService.getMessages(consultationId, user, limit);
  }

  async getDoctorHistory(
    user: RequestUser,
    query: ListConsultationsHistoryDto,
  ) {
    return this.getHistory(
      {
        assignedDoctorId: new Types.ObjectId(user.userId),
        ...(query.status ? { status: query.status } : {}),
      },
      query,
    );
  }

  async getPatientHistory(
    user: RequestUser,
    query: ListConsultationsHistoryDto,
  ) {
    return this.getHistory(
      {
        patientId: new Types.ObjectId(user.userId),
        ...(query.status ? { status: query.status } : {}),
      },
      query,
    );
  }

  async rate(
    consultationId: string,
    user: RequestUser,
    dto: RateConsultationDto,
  ) {
    const consultation = await this.consultationModel
      .findById(consultationId)
      .exec();
    if (!consultation || consultation.patientId.toString() !== user.userId) {
      throw new NotFoundException('Consulta no encontrada');
    }

    if (consultation.status !== CONSULTATION_CLOSED) {
      throw new BadRequestException('Solo puedes calificar consultas cerradas');
    }

    if (consultation.rating !== undefined) {
      throw new ConflictException('Esta consulta ya fue calificada');
    }

    consultation.rating = dto.rating;
    consultation.ratingComment = dto.ratingComment;
    await consultation.save();

    return {
      id: consultation.id,
      rating: consultation.rating,
      ratingComment: consultation.ratingComment ?? null,
    };
  }

  async findByIdUnsafe(consultationId: string) {
    return this.consultationModel.findById(consultationId).exec();
  }

  private async getHistory(
    filter: Record<string, unknown>,
    query: ListConsultationsHistoryDto,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.consultationModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.consultationModel.countDocuments(filter),
    ]);

    return {
      items: items.map((item) => ({
        id: item._id.toString(),
        patientId: item.patientId?.toString(),
        specialty: item.specialty,
        priority: item.priority,
        status: item.status,
        clinicalSummary: item.clinicalSummary ?? null,
        rating: item.rating ?? null,
        ratingComment: item.ratingComment ?? null,
        createdAt: item.createdAt?.toISOString() ?? null,
        closedAt: item.closedAt?.toISOString() ?? null,
      })),
      total,
      page,
      limit,
    };
  }

  private async findOwnedOrAccessibleConsultation(
    consultationId: string,
    user: RequestUser,
  ) {
    if (!Types.ObjectId.isValid(consultationId)) {
      throw new NotFoundException('Consulta no encontrada');
    }

    const consultation = await this.consultationModel
      .findById(consultationId)
      .exec();
    if (!consultation) {
      throw new NotFoundException('Consulta no encontrada');
    }

    if (user.role === UserRole.ADMIN) {
      return consultation;
    }

    if (user.role === UserRole.PATIENT) {
      if (consultation.patientId.toString() !== user.userId) {
        throw new ForbiddenException('No puedes acceder a esta consulta');
      }
      return consultation;
    }

    if (
      user.role === UserRole.DOCTOR &&
      consultation.assignedDoctorId?.toString() !== user.userId
    ) {
      throw new ForbiddenException('No puedes acceder a esta consulta');
    }

    return consultation;
  }

  private assertAssignedDoctor(
    consultation: ConsultationDocument,
    user: RequestUser,
  ) {
    if (consultation.assignedDoctorId?.toString() !== user.userId) {
      throw new ForbiddenException(
        'Solo el medico asignado puede modificar la consulta',
      );
    }
  }

  private toObjectId(value: string | Types.ObjectId): Types.ObjectId {
    if (value instanceof Types.ObjectId) {
      return value;
    }

    return new Types.ObjectId(value);
  }

  private formatAnswerValue(value: unknown): string {
    if (value === null || value === undefined) {
      return 'No informado';
    }

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return String(value);
    }

    try {
      return JSON.stringify(value);
    } catch {
      return 'No informado';
    }
  }

  private isRagSummaryEnabled(): boolean {
    return this.configService?.get<boolean>('rag.summaryEnabled') === true;
  }

  private async closeWithoutTransaction(
    consultationId: string,
    user: RequestUser,
    dto: CloseConsultationDto,
    correlationId?: string,
  ) {
    const consultation = await this.consultationModel
      .findById(consultationId)
      .exec();
    if (!consultation) {
      throw new NotFoundException('Consulta no encontrada');
    }

    this.assertAssignedDoctor(consultation, user);
    if (consultation.status !== CONSULTATION_IN_ATTENTION) {
      throw new BadRequestException(
        'Solo se pueden cerrar consultas en atencion',
      );
    }

    consultation.status = CONSULTATION_CLOSED;
    consultation.closedAt = new Date();
    if (dto.baselineSymptomSeverity !== undefined) {
      consultation.baselineSymptomSeverity = dto.baselineSymptomSeverity;
    }
    if (dto.redFlagsConfirmed !== undefined) {
      consultation.redFlagsConfirmed = dto.redFlagsConfirmed;
    }
    await consultation.save();

    await this.outboxService.createConsultationClosedEvent(
      { consultationId: consultation.id },
      correlationId,
    );

    await this.notificationsService.createUserNotification({
      userId: consultation.patientId.toString(),
      type: 'CONSULTATION_CLOSED',
      status: consultation.status,
      message: 'Tu consulta finalizó. Puedes calificar la atención recibida.',
      resourceId: consultation.id,
      deepLink: `/consultations/${consultation.id}`,
      sourceEventId: `consultation-closed:${consultation.id}`,
      metadata: {
        consultationId: consultation.id,
      },
    });

    await this.outboxDispatcherService.dispatchPendingEvents();

    return {
      id: consultation.id,
      status: consultation.status,
      closedAt: consultation.closedAt.toISOString(),
    };
  }
}
