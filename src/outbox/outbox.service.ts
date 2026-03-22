import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { DoctorStatus } from '../common/enums/doctor-status.enum';
import { DOCTOR_VERIFICATION_CHANGED_EVENT } from './outbox.constants';
import {
  OutboxEvent,
  OutboxEventDocument,
} from './schemas/outbox-event.schema';

export type DoctorVerificationChangedPayload = {
  doctorId: string;
  doctorStatus: DoctorStatus;
  notes?: string;
};

@Injectable()
export class OutboxService {
  constructor(
    @InjectModel(OutboxEvent.name)
    private readonly outboxEventModel: Model<OutboxEventDocument>,
  ) {}

  async createDoctorVerificationChangedEvent(
    payload: DoctorVerificationChangedPayload,
    correlationId?: string,
    session?: ClientSession,
  ): Promise<OutboxEventDocument> {
    const [event] = await this.outboxEventModel.create(
      [
        {
          eventType: DOCTOR_VERIFICATION_CHANGED_EVENT,
          aggregateType: 'doctor',
          aggregateId: payload.doctorId,
          payload,
          correlationId,
          status: 'pending',
          attempts: 0,
          availableAt: new Date(),
        },
      ],
      session ? { session } : undefined,
    );

    return event;
  }

  async claimNextPendingEvent(): Promise<OutboxEventDocument | null> {
    return this.outboxEventModel
      .findOneAndUpdate(
        {
          status: 'pending',
          availableAt: { $lte: new Date() },
        },
        {
          $set: {
            status: 'dispatched',
            lastError: undefined,
          },
          $inc: {
            attempts: 1,
          },
        },
        {
          sort: { createdAt: 1 },
          returnDocument: 'after',
        },
      )
      .exec();
  }

  async findById(eventId: string): Promise<OutboxEventDocument | null> {
    return this.outboxEventModel.findById(eventId).exec();
  }

  async markProcessed(eventId: string): Promise<void> {
    await this.outboxEventModel
      .updateOne(
        { _id: eventId },
        {
          $set: {
            status: 'processed',
            processedAt: new Date(),
            lastError: undefined,
          },
        },
      )
      .exec();
  }

  async reschedule(
    eventId: string,
    attempts: number,
    error: string,
  ): Promise<void> {
    const delayMs = Math.min(1_000 * 2 ** Math.max(attempts - 1, 0), 30_000);

    await this.outboxEventModel
      .updateOne(
        { _id: eventId },
        {
          $set: {
            status: attempts >= 5 ? 'failed' : 'pending',
            availableAt:
              attempts >= 5 ? new Date() : new Date(Date.now() + delayMs),
            lastError: error,
          },
        },
      )
      .exec();
  }
}
