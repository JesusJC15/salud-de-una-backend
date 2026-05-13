import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { isDuplicateKeyError } from '../common/utils/errors.util';
import { Model, Types } from 'mongoose';
import {
  Consultation,
  ConsultationDocument,
} from '../consultations/schemas/consultation.schema';
import { Specialty } from '../common/enums/specialty.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { RequestUser } from '../common/interfaces/request-user.interface';
import { NotificationsService } from '../notifications/notifications.service';
import {
  TriageSession,
  TriageSessionDocument,
  TriagePriority,
} from '../triage/schemas/triage-session.schema';
import { SubmitFollowupDto } from './dto/submit-followup.dto';
import { FOLLOWUPS_QUEUE } from './followups.constants';
import {
  Followup,
  FollowupDocument,
  FollowupStatus,
} from './schemas/followup.schema';

const FOLLOWUP_OFFSET_HOURS_72H = 72; // Primera revisión: 3 días post-consulta
const FOLLOWUP_OFFSET_HOURS_7D = 24 * 7; // Segunda revisión: 1 semana post-consulta

@Injectable()
export class FollowupsService {
  private readonly logger = new Logger(FollowupsService.name);

  constructor(
    @InjectModel(Followup.name)
    private readonly followupModel: Model<FollowupDocument>,
    @InjectModel(Consultation.name)
    private readonly consultationModel: Model<ConsultationDocument>,
    @InjectModel(TriageSession.name)
    private readonly triageSessionModel: Model<TriageSessionDocument>,
    private readonly notificationsService: NotificationsService,
    @Inject(FOLLOWUPS_QUEUE)
    private readonly followupsQueue: Queue | null,
  ) {}

  async handleConsultationClosedEvent(consultationId: string) {
    const consultation = await this.consultationModel
      .findById(consultationId)
      .exec();
    if (!consultation || !consultation.closedAt) {
      return;
    }

    const offsets = [FOLLOWUP_OFFSET_HOURS_72H, FOLLOWUP_OFFSET_HOURS_7D];
    const created: FollowupDocument[] = [];
    for (const offsetHours of offsets) {
      const scheduledAt = new Date(
        consultation.closedAt.getTime() + offsetHours * 60 * 60 * 1000,
      );
      const reminderAt = scheduledAt;

      const followup =
        typeof this.followupModel.findOneAndUpdate === 'function'
          ? await this.followupModel
              .findOneAndUpdate(
                {
                  consultationId: consultation._id,
                  scheduledAt,
                },
                {
                  $setOnInsert: {
                    consultationId: consultation._id,
                    patientId: consultation.patientId,
                    doctorId: consultation.assignedDoctorId,
                    scheduledAt,
                    reminderAt,
                    baselineSymptomSeverity:
                      consultation.baselineSymptomSeverity ?? 5,
                    status: 'PENDING',
                  },
                },
                {
                  upsert: true,
                  returnDocument: 'after',
                  setDefaultsOnInsert: true,
                },
              )
              .exec()
          : (
              await this.followupModel.create([
                {
                  consultationId: consultation._id,
                  patientId: consultation.patientId,
                  doctorId: consultation.assignedDoctorId,
                  scheduledAt,
                  reminderAt,
                  baselineSymptomSeverity:
                    consultation.baselineSymptomSeverity ?? 5,
                  status: 'PENDING',
                },
              ])
            )[0];

      if (!followup) {
        continue;
      }

      created.push(followup);
      await this.scheduleJobs(followup);
    }

    return created;
  }

  async getMine(user: RequestUser, status?: FollowupStatus) {
    const items = await this.followupModel
      .find({
        patientId: new Types.ObjectId(user.userId),
        ...(status ? { status } : {}),
      })
      .sort({ scheduledAt: 1 })
      .lean()
      .exec();

    return {
      items: items.map((item) => this.toResponse(item)),
    };
  }

  async getById(followupId: string, user: RequestUser) {
    const followup = await this.followupModel
      .findById(followupId)
      .lean()
      .exec();
    if (!followup) {
      throw new NotFoundException('Seguimiento no encontrado');
    }

    if (
      user.role === UserRole.PATIENT &&
      followup.patientId.toString() !== user.userId
    ) {
      throw new NotFoundException('Seguimiento no encontrado');
    }

    if (
      user.role === UserRole.DOCTOR &&
      followup.doctorId?.toString() !== user.userId
    ) {
      throw new NotFoundException('Seguimiento no encontrado');
    }

    return this.toResponse(followup);
  }

  async submit(user: RequestUser, dto: SubmitFollowupDto) {
    const followup = await this.followupModel.findById(dto.followupId).exec();
    if (!followup || followup.patientId.toString() !== user.userId) {
      throw new NotFoundException('Seguimiento no encontrado');
    }

    followup.currentSymptomSeverity = dto.currentSymptomSeverity;
    followup.change = dto.change;
    followup.medicationTaken = dto.medicationTaken;
    followup.medicationNotes = dto.medicationNotes;
    followup.newSymptoms = dto.newSymptoms;
    followup.submittedAt = new Date();
    followup.status = 'COMPLETED';

    let createdConsultationId: string | null = null;
    const delta = dto.currentSymptomSeverity - followup.baselineSymptomSeverity;
    if (dto.change === 'WORSE' && delta >= 2) {
      const consultation = await this.consultationModel
        .findById(followup.consultationId)
        .select('patientId triageSessionId specialty priority')
        .lean()
        .exec();

      if (consultation) {
        const existingEscalation =
          typeof this.consultationModel.findOne === 'function'
            ? await this.consultationModel
                .findOne({ sourceFollowupId: followup._id })
                .select('_id')
                .lean()
                .exec()
            : null;

        const escalated =
          existingEscalation ??
          (await this.createEscalatedConsultation({
            patientId: consultation.patientId,
            triageSessionId: consultation.triageSessionId,
            specialty: consultation.specialty,
            priority: this.bumpPriority(consultation.priority),
            sourceFollowupId: followup._id,
          }));
        followup.priorityEscalated = true;
        followup.createdConsultationId = escalated._id;
        createdConsultationId =
          (escalated as { id?: string }).id ?? escalated._id.toString();

        this.logger.log(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            level: 'info',
            service: 'api',
            endpoint_or_event: 'followup.priority_escalated',
            followup_id: followup.id,
            consultation_id: createdConsultationId,
            patient_id: followup.patientId.toString(),
            doctor_id: followup.doctorId?.toString() ?? null,
            idempotent_reuse: Boolean(existingEscalation),
          }),
        );

        if (!existingEscalation && followup.doctorId) {
          await this.notificationsService.createUserNotification({
            userId: followup.doctorId.toString(),
            type: 'FOLLOWUP_PRIORITY_ESCALATED',
            status: 'ACTION_REQUIRED',
            message:
              'Un seguimiento reportó empeoramiento y abrió una nueva consulta priorizada.',
            resourceId: escalated.id,
            deepLink: `/doctor/consultations/${escalated.id}`,
          });
        }
      }
    }

    await followup.save();

    return {
      followup: this.toResponse(followup.toObject()),
      priorityEscalated: followup.priorityEscalated,
      createdConsultationId,
    };
  }

  async processDueFollowups() {
    const dueFollowups = await this.followupModel
      .find({
        status: 'PENDING',
        scheduledAt: { $lte: new Date() },
      })
      .select('_id')
      .lean()
      .exec();

    for (const followup of dueFollowups) {
      await this.markDue(followup._id.toString());
    }
  }

  async processMissedFollowups() {
    const missedFollowups = await this.followupModel
      .find({
        status: 'REMINDED',
        scheduledAt: {
          $lte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      })
      .select('_id')
      .lean()
      .exec();

    for (const followup of missedFollowups) {
      await this.markMissed(followup._id.toString());
    }
  }

  async markDue(followupId: string) {
    const followup = await this.followupModel.findById(followupId).exec();
    if (!followup || followup.status !== 'PENDING') {
      return;
    }

    followup.status = 'REMINDED';
    await followup.save();

    await this.notificationsService.createUserNotification({
      userId: followup.patientId.toString(),
      type: 'FOLLOWUP_REMINDER',
      status: 'PENDING',
      message: 'Tienes un seguimiento pendiente para registrar tu evolución.',
      resourceId: followup.id,
      deepLink: `/followup/${followup.id}`,
      sourceEventId: `followup-due:${followup.id}`,
      metadata: {
        followupId: followup.id,
      },
      push: {
        title: 'Seguimiento pendiente',
        body: 'Tienes un seguimiento pendiente para registrar tu evolucion.',
        data: {
          followupId: followup.id,
          deepLink: `/followup/${followup.id}`,
          type: 'FOLLOWUP_REMINDER',
        },
      },
    });
  }

  async markMissed(followupId: string) {
    const followup = await this.followupModel.findById(followupId).exec();
    if (!followup || followup.status !== 'REMINDED') {
      return;
    }

    followup.status = 'MISSED';
    await followup.save();
  }

  private async scheduleJobs(followup: FollowupDocument) {
    if (!this.followupsQueue) {
      this.logger.debug(
        `Skipping distributed scheduling for followup ${followup.id}: queue unavailable`,
      );
      return;
    }

    const dueDelay = Math.max(followup.scheduledAt.getTime() - Date.now(), 0);
    const missedDelay = Math.max(
      followup.scheduledAt.getTime() + 24 * 60 * 60 * 1000 - Date.now(),
      0,
    );

    await this.followupsQueue.add(
      'followup-due',
      { followupId: followup.id, action: 'due' },
      {
        delay: dueDelay,
        jobId: `followup-due:${followup.id}`,
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );
    await this.followupsQueue.add(
      'followup-missed',
      { followupId: followup.id, action: 'missed' },
      {
        delay: missedDelay,
        jobId: `followup-missed:${followup.id}`,
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );
  }

  private bumpPriority(priority: TriagePriority): TriagePriority {
    if (priority === 'LOW') {
      return 'MODERATE';
    }
    return 'HIGH';
  }

  private async createEscalatedConsultation(input: {
    patientId: Types.ObjectId;
    triageSessionId: Types.ObjectId;
    specialty: Specialty;
    priority: TriagePriority;
    sourceFollowupId: Types.ObjectId;
  }): Promise<ConsultationDocument | { _id: Types.ObjectId; id?: string }> {
    try {
      const [escalated] = await this.consultationModel.create([
        {
          patientId: input.patientId,
          triageSessionId: input.triageSessionId,
          specialty: input.specialty,
          priority: input.priority,
          status: 'PENDING' as const,
          sourceFollowupId: input.sourceFollowupId,
        },
      ]);
      return escalated;
    } catch (error: unknown) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      const existing = await this.consultationModel
        .findOne({ sourceFollowupId: input.sourceFollowupId })
        .select('_id')
        .lean()
        .exec();

      if (!existing) {
        throw new ConflictException(
          'Este seguimiento ya genero una consulta priorizada',
        );
      }

      return existing;
    }
  }

  private toResponse(
    followup:
      | Followup
      | FollowupDocument
      | (Followup & { _id: Types.ObjectId }),
  ) {
    const current = followup as FollowupDocument;
    return {
      id: current._id.toString(),
      consultationId: current.consultationId.toString(),
      patientId: current.patientId.toString(),
      doctorId: current.doctorId?.toString(),
      scheduledAt: current.scheduledAt.toISOString(),
      reminderAt: current.reminderAt.toISOString(),
      status: current.status,
      baselineSymptomSeverity: current.baselineSymptomSeverity,
      currentSymptomSeverity: current.currentSymptomSeverity ?? null,
      change: current.change ?? null,
      medicationTaken: current.medicationTaken ?? null,
      medicationNotes: current.medicationNotes ?? null,
      newSymptoms: current.newSymptoms ?? null,
      submittedAt: current.submittedAt?.toISOString() ?? null,
      priorityEscalated: current.priorityEscalated,
      createdConsultationId: current.createdConsultationId?.toString() ?? null,
    };
  }
}
