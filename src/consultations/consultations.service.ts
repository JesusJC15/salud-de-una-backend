import {
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
    private readonly aiService: AiService,
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

    return {
      id: consultation._id.toString(),
      status: consultation.status,
      closedAt: consultation.closedAt,
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
