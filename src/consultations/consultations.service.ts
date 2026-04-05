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

  async getQueue() {
    const items = await this.consultationModel
      .find({ status: 'PENDING' })
      .lean()
      .exec();

    const priorityRank: Record<TriagePriority, number> = {
      HIGH: 0,
      MODERATE: 1,
      LOW: 2,
    };

    const orderedItems = [...items].sort((a, b) => {
      const byPriority = priorityRank[a.priority] - priorityRank[b.priority];
      if (byPriority !== 0) {
        return byPriority;
      }

      const aCreatedAt = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bCreatedAt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return aCreatedAt - bCreatedAt;
    });

    return {
      items: orderedItems.map((consultation) => ({
        id: consultation._id.toString(),
        patientId: consultation.patientId.toString(),
        triageSessionId: consultation.triageSessionId.toString(),
        specialty: consultation.specialty,
        priority: consultation.priority,
        status: consultation.status,
        createdAt: consultation.createdAt ?? null,
      })),
    };
  }

  private toObjectId(value: string | Types.ObjectId): Types.ObjectId {
    if (value instanceof Types.ObjectId) {
      return value;
    }

    return new Types.ObjectId(value);
  }
}
