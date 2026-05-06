import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserRole } from '../common/enums/user-role.enum';
import { RequestUser } from '../common/interfaces/request-user.interface';
import {
  Consultation,
  ConsultationDocument,
} from '../consultations/schemas/consultation.schema';
import { Doctor, DoctorDocument } from '../doctors/schemas/doctor.schema';
import {
  Followup,
  FollowupDocument,
} from '../followups/schemas/followup.schema';
import {
  TriageSession,
  TriageSessionDocument,
} from '../triage/schemas/triage-session.schema';
import { TimelineQueryDto } from './dto/timeline-query.dto';

type TimelineEventType =
  | 'TRIAGE_COMPLETED'
  | 'CONSULTATION_ASSIGNED'
  | 'CONSULTATION_CLOSED'
  | 'FOLLOWUP_CREATED'
  | 'FOLLOWUP_DUE'
  | 'FOLLOWUP_COMPLETED'
  | 'PRIORITY_ESCALATED';

type TimelineEvent = {
  id: string;
  type: TimelineEventType;
  occurredAt: string;
  title: string;
  subtitle: string;
  resourceId?: string;
};

@Injectable()
export class PatientTimelineService {
  constructor(
    @InjectModel(Doctor.name)
    private readonly doctorModel: Model<DoctorDocument>,
    @InjectModel(Consultation.name)
    private readonly consultationModel: Model<ConsultationDocument>,
    @InjectModel(TriageSession.name)
    private readonly triageSessionModel: Model<TriageSessionDocument>,
    @InjectModel(Followup.name)
    private readonly followupModel: Model<FollowupDocument>,
  ) {}

  async getTimeline(
    user: RequestUser,
    patientId: string,
    query: TimelineQueryDto,
  ) {
    if (!Types.ObjectId.isValid(patientId)) {
      throw new BadRequestException('patientId invalido');
    }

    await this.assertCanReadTimeline(user, patientId);

    const patientObjectId = new Types.ObjectId(patientId);
    const [triageSessions, consultations, followups] = await Promise.all([
      this.triageSessionModel
        .find({ patientId: patientObjectId, status: 'COMPLETED' })
        .select('specialty completedAt createdAt')
        .lean()
        .exec(),
      this.consultationModel
        .find({ patientId: patientObjectId })
        .select(
          'specialty priority assignedAt closedAt createdAt sourceFollowupId',
        )
        .lean()
        .exec(),
      this.followupModel
        .find({ patientId: patientObjectId })
        .select(
          'scheduledAt submittedAt createdAt createdConsultationId priorityEscalated status',
        )
        .lean()
        .exec(),
    ]);

    const events: TimelineEvent[] = [];

    for (const triageSession of triageSessions) {
      const occurredAt =
        triageSession.completedAt ?? triageSession.createdAt ?? new Date();
      events.push({
        id: `triage-${triageSession._id.toString()}`,
        type: 'TRIAGE_COMPLETED',
        occurredAt: occurredAt.toISOString(),
        title: 'Triage completado',
        subtitle: `Especialidad: ${triageSession.specialty}`,
        resourceId: triageSession._id.toString(),
      });
    }

    for (const consultation of consultations) {
      if (consultation.assignedAt) {
        events.push({
          id: `consultation-assigned-${consultation._id.toString()}`,
          type: 'CONSULTATION_ASSIGNED',
          occurredAt: consultation.assignedAt.toISOString(),
          title: 'Consulta asignada',
          subtitle: `Prioridad ${consultation.priority}`,
          resourceId: consultation._id.toString(),
        });
      }

      if (consultation.closedAt) {
        events.push({
          id: `consultation-closed-${consultation._id.toString()}`,
          type: 'CONSULTATION_CLOSED',
          occurredAt: consultation.closedAt.toISOString(),
          title: 'Consulta cerrada',
          subtitle: `Especialidad: ${consultation.specialty}`,
          resourceId: consultation._id.toString(),
        });
      }
    }

    for (const followup of followups) {
      const createdAt = followup.createdAt ?? followup.scheduledAt;
      if (createdAt) {
        events.push({
          id: `followup-created-${followup._id.toString()}`,
          type: 'FOLLOWUP_CREATED',
          occurredAt: createdAt.toISOString(),
          title: 'Seguimiento programado',
          subtitle: 'Se creó un seguimiento post-consulta',
          resourceId: followup._id.toString(),
        });
      }

      if (followup.status === 'REMINDED') {
        events.push({
          id: `followup-due-${followup._id.toString()}`,
          type: 'FOLLOWUP_DUE',
          occurredAt: followup.scheduledAt.toISOString(),
          title: 'Seguimiento disponible',
          subtitle: 'El paciente ya puede responder el formulario',
          resourceId: followup._id.toString(),
        });
      }

      if (followup.submittedAt) {
        events.push({
          id: `followup-completed-${followup._id.toString()}`,
          type: 'FOLLOWUP_COMPLETED',
          occurredAt: followup.submittedAt.toISOString(),
          title: 'Seguimiento respondido',
          subtitle: 'El paciente registró su evolución',
          resourceId: followup._id.toString(),
        });
      }

      if (followup.priorityEscalated && followup.createdConsultationId) {
        events.push({
          id: `followup-escalated-${followup._id.toString()}`,
          type: 'PRIORITY_ESCALATED',
          occurredAt:
            (
              followup.submittedAt ??
              followup.updatedAt ??
              followup.createdAt
            )?.toISOString() ?? new Date().toISOString(),
          title: 'Caso re-priorizado',
          subtitle: 'Se abrió una nueva consulta por empeoramiento',
          resourceId: followup.createdConsultationId.toString(),
        });
      }
    }

    const sortedEvents = events.sort(
      (left, right) =>
        new Date(right.occurredAt).getTime() -
        new Date(left.occurredAt).getTime(),
    );

    const cursorDate = query.cursor ? new Date(query.cursor) : null;
    const filteredEvents = cursorDate
      ? sortedEvents.filter(
          (event) =>
            new Date(event.occurredAt).getTime() < cursorDate.getTime(),
        )
      : sortedEvents;

    const limit = query.limit ?? 20;
    const items = filteredEvents.slice(0, limit);
    const nextCursor =
      filteredEvents.length > limit
        ? (items[items.length - 1]?.occurredAt ?? null)
        : null;

    return {
      items,
      nextCursor,
    };
  }

  private async assertCanReadTimeline(user: RequestUser, patientId: string) {
    if (user.role === UserRole.ADMIN) {
      return;
    }

    if (user.role === UserRole.PATIENT) {
      if (user.userId !== patientId) {
        throw new ForbiddenException(
          'No puedes ver el timeline de otro paciente',
        );
      }
      return;
    }

    if (user.role === UserRole.DOCTOR) {
      const doctor = await this.doctorModel
        .findById(user.userId)
        .select('_id')
        .lean()
        .exec();

      if (!doctor) {
        throw new ForbiddenException('Medico no encontrado');
      }

      const hasConsultation = await this.consultationModel
        .exists({
          patientId: new Types.ObjectId(patientId),
          assignedDoctorId: doctor._id,
        })
        .exec();

      if (!hasConsultation) {
        throw new ForbiddenException(
          'No puedes ver el timeline de un paciente no atendido',
        );
      }
    }
  }
}
