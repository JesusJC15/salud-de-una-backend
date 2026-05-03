import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { randomUUID } from 'crypto';
import { Specialty } from '../common/enums/specialty.enum';
import { AiService } from '../ai/ai.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Patient, PatientDocument } from '../patients/schemas/patient.schema';
import { TriagePriority } from '../triage/schemas/triage-session.schema';
import {
  TriageSession,
  TriageSessionDocument,
} from '../triage/schemas/triage-session.schema';
import {
  ConsultationMessage,
  ConsultationMessageDocument,
} from '../chat/schemas/consultation-message.schema';
import {
  Consultation,
  ConsultationDocument,
} from './schemas/consultation.schema';
import { RateConsultationDto } from './dto/rate-consultation.dto';

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
    @InjectModel(TriageSession.name)
    private readonly triageSessionModel: Model<TriageSessionDocument>,
    @InjectModel(ConsultationMessage.name)
    private readonly messageModel: Model<ConsultationMessageDocument>,
    @InjectModel(Patient.name)
    private readonly patientModel: Model<PatientDocument>,
    private readonly aiService: AiService,
    private readonly notificationsService: NotificationsService,
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

    const sorted = [...pendingConsultations].sort((a, b) => {
      const rankDiff =
        this.getPriorityRank(a.priority) - this.getPriorityRank(b.priority);
      if (rankDiff !== 0) return rankDiff;
      const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tA - tB;
    });

    const items = sorted.slice(skip, skip + limit).map((row) => ({
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

  async getById(consultationId: string, doctorId: string) {
    const consultation = await this.consultationModel
      .findById(consultationId)
      .lean()
      .exec();

    if (!consultation) {
      throw new NotFoundException('Consulta no encontrada');
    }

    if (
      consultation.assignedDoctorId &&
      consultation.assignedDoctorId.toString() !== doctorId
    ) {
      throw new ForbiddenException('Esta consulta está asignada a otro médico');
    }

    const triageSession = await this.triageSessionModel
      .findById(consultation.triageSessionId)
      .select('specialty status answers analysis priority')
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
      closedAt: consultation.closedAt,
      createdAt: consultation.createdAt,
      updatedAt: consultation.updatedAt,
      triage: triageSession
        ? {
            status: triageSession.status,
            answers: triageSession.answers,
            analysis: triageSession.analysis,
          }
        : null,
    };
  }

  async assign(consultationId: string, doctorId: string) {
    const consultation = await this.consultationModel
      .findById(consultationId)
      .exec();

    if (!consultation) {
      throw new NotFoundException('Consulta no encontrada');
    }

    if (consultation.status !== 'PENDING') {
      throw new ConflictException(
        `La consulta ya está en estado ${consultation.status}`,
      );
    }

    consultation.status = 'IN_ATTENTION';
    consultation.assignedDoctorId = new Types.ObjectId(doctorId);
    await consultation.save();

    this.notifyPatient(
      consultation.patientId.toString(),
      'Consulta aceptada',
      'Un médico está atendiendo tu consulta ahora.',
    );

    return {
      id: consultation._id.toString(),
      status: consultation.status,
      assignedDoctorId: doctorId,
      updatedAt: consultation.updatedAt,
    };
  }

  async generateSummary(consultationId: string, doctorId: string) {
    const consultation = await this.consultationModel
      .findById(consultationId)
      .exec();

    if (!consultation) {
      throw new NotFoundException('Consulta no encontrada');
    }

    if (consultation.assignedDoctorId?.toString() !== doctorId) {
      throw new ForbiddenException(
        'Solo el médico asignado puede generar el resumen',
      );
    }

    const triageSession = await this.triageSessionModel
      .findById(consultation.triageSessionId)
      .lean()
      .exec();

    if (!triageSession) {
      throw new NotFoundException('Sesión de triage no encontrada');
    }

    // Build triage context text for Gemini
    const answersText = triageSession.answers
      .map(
        (a) =>
          `Pregunta: ${a.questionText}\nRespuesta: ${String(a.answerValue)}`,
      )
      .join('\n\n');

    const redFlagsText = triageSession.analysis?.redFlags?.length
      ? `\nSignos de alarma detectados:\n${triageSession.analysis.redFlags
          .map((rf) => `- [${rf.severity}] ${rf.evidence}`)
          .join('\n')}`
      : '\nNo se detectaron signos de alarma.';

    const inputText =
      `Especialidad: ${triageSession.specialty}\n` +
      `Prioridad asignada: ${triageSession.analysis?.priority ?? 'SIN ANALIZAR'}\n\n` +
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

      const summary = result.text?.trim() ?? '';
      consultation.clinicalSummary = summary;
      await consultation.save();

      return {
        consultationId,
        summary,
        generatedAt: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException(
        'No fue posible generar el resumen clínico en este momento',
      );
    }
  }

  async close(consultationId: string, doctorId: string) {
    const consultation = await this.consultationModel
      .findById(consultationId)
      .exec();

    if (!consultation) {
      throw new NotFoundException('Consulta no encontrada');
    }

    if (consultation.assignedDoctorId?.toString() !== doctorId) {
      throw new ForbiddenException(
        'Solo el médico asignado puede cerrar la consulta',
      );
    }

    if (consultation.status !== 'IN_ATTENTION') {
      throw new ConflictException(
        `La consulta ya está en estado ${consultation.status}`,
      );
    }

    consultation.status = 'CLOSED';
    consultation.closedAt = new Date();
    await consultation.save();

    this.notifyPatient(
      consultation.patientId.toString(),
      'Consulta finalizada',
      '¿Cómo fue tu atención? Califica tu experiencia.',
    );

    return {
      id: consultation._id.toString(),
      status: consultation.status,
      closedAt: consultation.closedAt,
    };
  }

  async rateConsultation(
    consultationId: string,
    patientId: string,
    dto: RateConsultationDto,
  ) {
    const consultation = await this.consultationModel
      .findById(consultationId)
      .exec();

    if (!consultation) {
      throw new NotFoundException('Consulta no encontrada');
    }

    if (consultation.patientId.toString() !== patientId) {
      throw new ForbiddenException('No tienes acceso a esta consulta');
    }

    if (consultation.status !== 'CLOSED') {
      throw new BadRequestException(
        'Solo se pueden calificar consultas cerradas',
      );
    }

    if (consultation.rating !== undefined) {
      throw new ConflictException('Esta consulta ya fue calificada');
    }

    consultation.rating = dto.rating;
    if (dto.ratingComment) {
      consultation.ratingComment = dto.ratingComment;
    }
    await consultation.save();

    return {
      id: consultation._id.toString(),
      rating: consultation.rating,
      ratingComment: consultation.ratingComment,
    };
  }

  async getMessages(consultationId: string, doctorId: string, limit = 50) {
    const consultation = await this.consultationModel
      .findById(consultationId)
      .lean()
      .exec();

    if (!consultation) {
      throw new NotFoundException('Consulta no encontrada');
    }

    if (
      consultation.assignedDoctorId &&
      consultation.assignedDoctorId.toString() !== doctorId
    ) {
      throw new ForbiddenException('Sin acceso a esta consulta');
    }

    const messages = await this.messageModel
      .find({ consultationId: new Types.ObjectId(consultationId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    return {
      items: messages.reverse().map((m) => ({
        id: m._id.toString(),
        consultationId: m.consultationId.toString(),
        senderId: m.senderId.toString(),
        senderRole: m.senderRole,
        content: m.content,
        type: m.type,
        createdAt: m.createdAt,
      })),
      total: messages.length,
    };
  }

  async getPatientHistory(
    patientId: string,
    options: { limit?: number; page?: number; status?: string } = {},
  ) {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
    const page = Math.max(options.page ?? 1, 1);
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {
      patientId: this.toObjectId(patientId),
    };
    if (options.status) filter.status = options.status;

    const [items, total] = await Promise.all([
      this.consultationModel
        .find(filter)
        .select(
          '_id specialty priority status clinicalSummary rating ratingComment createdAt closedAt updatedAt',
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.consultationModel.countDocuments(filter).exec(),
    ]);

    return {
      items: items.map((c) => ({
        id: c._id.toString(),
        specialty: c.specialty,
        priority: c.priority,
        status: c.status,
        clinicalSummary: c.clinicalSummary,
        rating: c.rating,
        ratingComment: c.ratingComment,
        createdAt: c.createdAt,
        closedAt: c.closedAt,
      })),
      total,
      page,
      limit,
    };
  }

  async getDoctorHistory(
    doctorId: string,
    options: { limit?: number; page?: number; status?: string } = {},
  ) {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
    const page = Math.max(options.page ?? 1, 1);
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {
      assignedDoctorId: this.toObjectId(doctorId),
    };
    if (options.status) filter.status = options.status;

    const [items, total] = await Promise.all([
      this.consultationModel
        .find(filter)
        .select(
          '_id patientId specialty priority status clinicalSummary createdAt closedAt',
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.consultationModel.countDocuments(filter).exec(),
    ]);

    return {
      items: items.map((c) => ({
        id: c._id.toString(),
        patientId: c.patientId.toString(),
        specialty: c.specialty,
        priority: c.priority,
        status: c.status,
        clinicalSummary: c.clinicalSummary,
        createdAt: c.createdAt,
        closedAt: c.closedAt,
      })),
      total,
      page,
      limit,
    };
  }

  private notifyPatient(patientId: string, title: string, body: string): void {
    this.patientModel
      .findById(patientId)
      .select('expoPushToken')
      .lean()
      .exec()
      .then((patient) => {
        if (patient?.expoPushToken) {
          this.notificationsService.sendExpoPush(
            patient.expoPushToken,
            title,
            body,
          );
        }
      })
      .catch(() => undefined);
  }

  private getPriorityRank(priority: TriagePriority): number {
    if (priority === 'HIGH') return 0;
    if (priority === 'MODERATE') return 1;
    if (priority === 'LOW') return 2;
    return 99;
  }

  private toObjectId(value: string | Types.ObjectId): Types.ObjectId {
    if (value instanceof Types.ObjectId) return value;
    return new Types.ObjectId(value);
  }
}
