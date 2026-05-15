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
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
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

type QueueOptions = { limit?: number; page?: number };

const CLINICAL_SUMMARY_SYSTEM_INSTRUCTION =
  'Eres un asistente médico clínico. Dado el resultado de un triage, genera un resumen ' +
  'clínico conciso (máximo 200 palabras) para el médico que va a atender al paciente. ' +
  'Incluye: síntoma principal, duración, intensidad, signos de alarma detectados y ' +
  'prioridad asignada. Usa lenguaje médico profesional en español. No hagas diagnósticos ' +
  'ni recomendaciones de tratamiento. Devuelve solo el cuerpo del resumen, sin títulos, ' +
  'sin encabezados, sin Markdown, sin negrillas y sin viñetas.';

const CONSULTATION_PENDING: ConsultationStatus = 'PENDING';
const CONSULTATION_IN_ATTENTION: ConsultationStatus = 'IN_ATTENTION';
const CONSULTATION_CLOSED: ConsultationStatus = 'CLOSED';

@Injectable()
export class ConsultationsService {
  private readonly logger = new Logger(ConsultationsService.name);

  constructor(
    @Optional()
    @InjectConnection()
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
    private readonly configService: ConfigService | null,
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

  async getQueue(
    userOrOptions: RequestUser | QueueOptions = {},
    maybeOptions: QueueOptions = {},
  ) {
    const isUserRequest = 'userId' in userOrOptions;
    const user = isUserRequest ? userOrOptions : undefined;
    const options: QueueOptions = isUserRequest ? maybeOptions : userOrOptions;
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 100);
    const page = Math.max(options.page ?? 1, 1);
    const skip = (page - 1) * limit;
    const allowedSpecialties = user
      ? await this.getDoctorQueueSpecialties(user.userId)
      : undefined;
    const queueFilter: {
      status: ConsultationStatus;
      specialty?: { $in: Specialty[] };
    } = {
      status: CONSULTATION_PENDING,
      ...(allowedSpecialties ? { specialty: { $in: allowedSpecialties } } : {}),
    };

    if (typeof this.consultationModel.aggregate !== 'function') {
      const pendingConsultations = (await this.consultationModel
        .find(queueFilter)
        .select(
          '_id patientId triageSessionId specialty priority status createdAt',
        )
        .lean()
        .exec()) as QueueRow[];

      const sortedPendingConsultations = [...pendingConsultations];
      sortedPendingConsultations.sort((a, b) => {
        const priorityRankDifference =
          this.getPriorityRank(a.priority) - this.getPriorityRank(b.priority);

        if (priorityRankDifference !== 0) {
          return priorityRankDifference;
        }

        const createdAtA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const createdAtB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return createdAtA - createdAtB;
      });

      const queueRows = sortedPendingConsultations.slice(skip, skip + limit);

      return {
        items: queueRows.map((row) => ({
          id: row._id.toString(),
          patientId: row.patientId.toString(),
          triageSessionId: row.triageSessionId.toString(),
          specialty: row.specialty,
          priority: row.priority,
          status: row.status,
          createdAt: row.createdAt,
        })),
      };
    }

    const queueRows = await this.consultationModel
      .aggregate<QueueRow>([
        {
          $match: queueFilter,
        },
        {
          $addFields: {
            priorityRank: {
              $cond: [
                { $eq: ['$priority', 'HIGH'] },
                0,
                {
                  $cond: [{ $eq: ['$priority', 'MODERATE'] }, 1, 2],
                },
              ],
            },
          },
        },
        {
          $sort: {
            priorityRank: 1,
            createdAt: 1,
          },
        },
        {
          $project: {
            _id: 1,
            patientId: 1,
            triageSessionId: 1,
            specialty: 1,
            priority: 1,
            status: 1,
            createdAt: 1,
          },
        },
        { $skip: skip },
        { $limit: limit },
      ])
      .exec();

    const items = queueRows.map((row) => ({
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

    if (!Types.ObjectId.isValid(consultationId)) {
      throw new NotFoundException('Consulta no encontrada');
    }

    const doctor = await this.doctorModel
      .findById(user.userId)
      .select('doctorStatus availabilityStatus specialty')
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

    const allowedSpecialties = this.buildAllowedQueueSpecialties(
      doctor.specialty,
    );

    const consultation = await this.consultationModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(consultationId),
          status: CONSULTATION_PENDING,
          specialty: { $in: allowedSpecialties },
        },
        {
          $set: {
            status: CONSULTATION_IN_ATTENTION,
            assignedDoctorId: new Types.ObjectId(user.userId),
            assignedAt: new Date(),
          },
        },
        {
          returnDocument: 'after',
        },
      )
      .exec();
    if (!consultation) {
      const existing = await this.consultationModel
        .findById(consultationId)
        .select('status specialty')
        .lean()
        .exec();

      if (!existing) {
        throw new NotFoundException('Consulta no encontrada');
      }

      if (
        existing.status === CONSULTATION_PENDING &&
        !allowedSpecialties.includes(existing.specialty)
      ) {
        throw new ForbiddenException(
          'La consulta no corresponde a tu especialidad',
        );
      }

      throw new ConflictException(
        'La consulta ya fue asignada o no esta pendiente',
      );
    }

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

    this.logger.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        service: 'api',
        endpoint_or_event: 'consultation.assigned',
        consultation_id: consultation.id,
        patient_id: consultation.patientId.toString(),
        doctor_id: user.userId,
        status: consultation.status,
      }),
    );

    return {
      id: consultation.id,
      status: consultation.status,
      assignedDoctorId: consultation.assignedDoctorId?.toString(),
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
    if (!this.connection?.startSession) {
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

      await this.notificationsService.createUserNotification({
        userId: consultation.patientId.toString(),
        type: 'CONSULTATION_CLOSED',
        status: consultation.status,
        message: 'Tu consulta finalizó. Puedes calificar la atención recibida.',
        resourceId: consultation.id,
        deepLink: `/consultations/${consultation.id}`,
        metadata: {
          consultationId: consultation.id,
        },
      });

      await this.outboxService.createConsultationClosedEvent(
        {
          consultationId: consultation.id,
        },
        correlationId,
      );
      await this.outboxDispatcherService.dispatchPendingEvents();

      return {
        id: consultation.id,
        status: consultation.status,
        closedAt: consultation.closedAt.toISOString(),
      };
    }

    const session = await this.connection.startSession();
    let response:
      | {
          id: string;
          status: ConsultationStatus;
          closedAt: string;
        }
      | undefined;

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

        await this.notificationsService.createUserNotification({
          userId: consultation.patientId.toString(),
          type: 'CONSULTATION_CLOSED',
          status: consultation.status,
          message:
            'Tu consulta finalizó. Puedes calificar la atención recibida.',
          resourceId: consultation.id,
          deepLink: `/consultations/${consultation.id}`,
          metadata: {
            consultationId: consultation.id,
          },
          session,
        });

        await this.outboxService.createConsultationClosedEvent(
          {
            consultationId: consultation.id,
          },
          correlationId,
          session,
        );

        response = {
          id: consultation.id,
          status: consultation.status,
          closedAt: consultation.closedAt.toISOString(),
        };
      });
    } finally {
      await session.endSession();
    }

    await this.outboxDispatcherService.dispatchPendingEvents();

    return response!;
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

    const patientContext = await this.getPatientClinicalContext(
      consultation.patientId,
    );

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
      `Datos del paciente:\n${patientContext}\n\n` +
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

        consultation.clinicalSummary = this.sanitizeClinicalSummary(
          ragResult.answer,
        );
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
          model:
            this.configService?.get<string>('ai.model') ?? 'gemini-2.5-flash',
          systemInstruction: CLINICAL_SUMMARY_SYSTEM_INSTRUCTION,
          inputText,
          correlationId: randomUUID(),
        });

        consultation.clinicalSummary = this.sanitizeClinicalSummary(
          result.text,
        );
        consultation.clinicalSummaryTraceId = undefined;
        consultation.clinicalSummaryCitations = [];
      }
    } catch {
      const summaryLines = [
        patientContext,
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

  private getPriorityRank(priority: TriagePriority): number {
    switch (priority) {
      case 'HIGH':
        return 0;
      case 'MODERATE':
        return 1;
      case 'LOW':
        return 2;
      default:
        return 99;
    }
  }

  private async getDoctorQueueSpecialties(doctorId: string) {
    if (!Types.ObjectId.isValid(doctorId)) {
      throw new BadRequestException('doctorId invalido');
    }

    const doctor = await this.doctorModel
      .findById(doctorId)
      .select('specialty')
      .lean<{ specialty?: Specialty }>()
      .exec();

    if (!doctor?.specialty) {
      throw new ForbiddenException('Especialidad medica no configurada');
    }

    return this.buildAllowedQueueSpecialties(doctor.specialty);
  }

  private buildAllowedQueueSpecialties(specialty: Specialty) {
    return Array.from(new Set([specialty, Specialty.URGENT_CARE]));
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

  private async getPatientClinicalContext(
    patientId: Types.ObjectId,
  ): Promise<string> {
    const patient = await this.patientModel
      .findById(patientId)
      .select('birthDate gender heightCm weightKg')
      .lean<{
        birthDate?: Date | string | null;
        gender?: string;
        heightCm?: number;
        weightKg?: number;
      }>()
      .exec();

    if (!patient) {
      return 'Datos demográficos no disponibles.';
    }

    const lines = [
      this.formatAge(patient.birthDate),
      patient.gender ? `Género: ${patient.gender}` : null,
      typeof patient.heightCm === 'number'
        ? `Altura: ${patient.heightCm} cm`
        : null,
      typeof patient.weightKg === 'number'
        ? `Peso: ${patient.weightKg} kg`
        : null,
      this.formatBmi(patient.heightCm, patient.weightKg),
    ].filter(Boolean);

    return lines.length > 0
      ? lines.join('\n')
      : 'Datos demográficos no disponibles.';
  }

  private formatAge(birthDate?: Date | string | null): string | null {
    if (!birthDate) {
      return null;
    }

    const parsedBirthDate = new Date(birthDate);
    if (Number.isNaN(parsedBirthDate.getTime())) {
      return null;
    }

    const today = new Date();
    let age = today.getFullYear() - parsedBirthDate.getFullYear();
    const monthDelta = today.getMonth() - parsedBirthDate.getMonth();
    if (
      monthDelta < 0 ||
      (monthDelta === 0 && today.getDate() < parsedBirthDate.getDate())
    ) {
      age -= 1;
    }

    return age >= 0 ? `Edad: ${age} años` : null;
  }

  private formatBmi(heightCm?: number, weightKg?: number): string | null {
    const bmi = this.calculateBmi(heightCm, weightKg);
    return bmi === null ? null : `IMC: ${bmi} kg/m2`;
  }

  private calculateBmi(heightCm?: number, weightKg?: number): number | null {
    if (
      typeof heightCm !== 'number' ||
      typeof weightKg !== 'number' ||
      heightCm <= 0 ||
      weightKg <= 0
    ) {
      return null;
    }

    const heightMeters = heightCm / 100;
    return Math.round((weightKg / (heightMeters * heightMeters)) * 10) / 10;
  }

  private sanitizeClinicalSummary(value?: string): string {
    const normalized = value?.trim() ?? '';

    return normalized
      .replace(
        /^\s*(?:#{1,6}\s*)?(?:\*\*)?\s*resumen\s+cl[ií]nico(?:\s+para\s+m[eé]dico\s+evaluador)?\s*:?\s*(?:\*\*)?\s*/iu,
        '',
      )
      .replace(/\*\*/g, '')
      .trim();
  }
}
