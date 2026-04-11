import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Specialty } from '../common/enums/specialty.enum';
import { TriagePriority } from '../triage/schemas/triage-session.schema';
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

@Injectable()
export class ConsultationsService {
  constructor(
    @InjectModel(Consultation.name)
    private readonly consultationModel: Model<ConsultationDocument>,
  ) {}

  async createFromTriage(
    input: CreateConsultationFromTriageInput,
    session?: ClientSession,
  ): Promise<void> {
    await this.consultationModel.create(
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

  private toObjectId(value: string | Types.ObjectId): Types.ObjectId {
    if (value instanceof Types.ObjectId) {
      return value;
    }

    return new Types.ObjectId(value);
  }
}
