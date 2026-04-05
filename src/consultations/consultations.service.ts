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

  async getQueue(options: { limit?: number; page?: number } = {}) {
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 100);
    const page = Math.max(options.page ?? 1, 1);
    const skip = (page - 1) * limit;

    const items = await this.consultationModel
      .aggregate<{
        id: string;
        patientId: string;
        triageSessionId: string;
        specialty: Specialty;
        priority: TriagePriority;
        status: string;
        createdAt: Date | null;
      }>([
        {
          $match: {
            status: 'PENDING',
          },
        },
        {
          $addFields: {
            priorityRank: {
              $switch: {
                branches: [
                  { case: { $eq: ['$priority', 'HIGH'] }, then: 0 },
                  { case: { $eq: ['$priority', 'MODERATE'] }, then: 1 },
                  { case: { $eq: ['$priority', 'LOW'] }, then: 2 },
                ],
                default: 99,
              },
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
          $skip: skip,
        },
        {
          $limit: limit,
        },
        {
          $project: {
            _id: 0,
            priorityRank: 0,
            id: { $toString: '$_id' },
            patientId: { $toString: '$patientId' },
            triageSessionId: { $toString: '$triageSessionId' },
            specialty: 1,
            priority: 1,
            status: 1,
            createdAt: { $ifNull: ['$createdAt', null] },
          },
        },
      ])
      .exec();

    return { items };
  }

  private toObjectId(value: string | Types.ObjectId): Types.ObjectId {
    if (value instanceof Types.ObjectId) {
      return value;
    }

    return new Types.ObjectId(value);
  }
}
