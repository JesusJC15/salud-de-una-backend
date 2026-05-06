import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { AiService } from '../ai/ai.service';
import { ChatService } from '../chat/chat.service';
import { DoctorStatus } from '../common/enums/doctor-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { RequestUser } from '../common/interfaces/request-user.interface';
import { OutboxDispatcherService } from '../outbox/outbox-dispatcher.service';
import { OutboxService } from '../outbox/outbox.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Patient, PatientDocument } from '../patients/schemas/patient.schema';
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

@Injectable()
export class ConsultationsService {
  constructor(
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

    const pendingConsultations = (await this.consultationModel
      .find({ status: 'PENDING' })
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

    if (doctor.availabilityStatus === 'PAUSED') {
      throw new ForbiddenException('Debes reanudar tu disponibilidad');
    }

    const consultation = await this.consultationModel
      .findById(consultationId)
      .exec();
    if (!consultation) {
      throw new NotFoundException('Consulta no encontrada');
    }

    if (consultation.status !== 'PENDING') {
      throw new BadRequestException(
        'Solo se pueden asignar consultas pendientes',
      );
    }

    consultation.status = 'IN_ATTENTION';
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
    const consultation = await this.consultationModel
      .findById(consultationId)
      .exec();
    if (!consultation) {
      throw new NotFoundException('Consulta no encontrada');
    }

    this.assertAssignedDoctor(consultation, user);

    if (consultation.status !== 'IN_ATTENTION') {
      throw new BadRequestException(
        'Solo se pueden cerrar consultas en atencion',
      );
    }

    consultation.status = 'CLOSED';
    consultation.closedAt = new Date();
    consultation.baselineSymptomSeverity = dto.baselineSymptomSeverity;
    consultation.redFlagsConfirmed = dto.redFlagsConfirmed;
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
      const result = await this.aiService.generateText({
        promptKey: 'CLINICAL_SUMMARY_V1',
        promptVersion: 1,
        model: 'gemini-2.5-flash',
        systemInstruction: CLINICAL_SUMMARY_SYSTEM_INSTRUCTION,
        inputText,
        correlationId: randomUUID(),
      });

      consultation.clinicalSummary = result.text?.trim() ?? '';
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

    if (consultation.status !== 'CLOSED') {
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
    if (priority === 'HIGH') {
      return 0;
    }
    if (priority === 'MODERATE') {
      return 1;
    }
    if (priority === 'LOW') {
      return 2;
    }

    return 99;
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
}
