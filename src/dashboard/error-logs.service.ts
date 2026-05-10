import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ErrorLogEntryDocument,
  ErrorLogRecord,
} from './schemas/error-log-entry.schema';

export type ErrorLogEntry = {
  id: string;
  timestamp: Date;
  statusCode: number;
  method: string;
  url: string;
  correlationId?: string;
  userId?: string;
  errorMessage: string;
};

@Injectable()
export class ErrorLogsService {
  private readonly logger = new Logger(ErrorLogsService.name);
  private readonly buffer: ErrorLogEntry[] = [];
  private readonly MAX_SIZE = 50;

  constructor(
    @InjectModel(ErrorLogRecord.name)
    private readonly errorLogModel: Model<ErrorLogEntryDocument>,
  ) {}

  append(entry: Omit<ErrorLogEntry, 'id' | 'timestamp'>): void {
    const payload = { ...entry, id: randomUUID(), timestamp: new Date() };
    this.buffer.unshift(payload);
    if (this.buffer.length > this.MAX_SIZE) {
      this.buffer.pop();
    }

    void this.errorLogModel
      .create({
        errorId: payload.id,
        statusCode: payload.statusCode,
        method: payload.method,
        url: payload.url,
        correlationId: payload.correlationId,
        userId: payload.userId,
        errorMessage: payload.errorMessage,
        createdAt: payload.timestamp,
      })
      .catch((error: unknown) => {
        this.logger.warn(
          `No fue posible persistir error log: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
  }

  async getRecent(limit = 20): Promise<ErrorLogEntry[]> {
    const sanitizedLimit = Math.min(limit, this.MAX_SIZE);
    const persisted = await this.errorLogModel
      .find()
      .sort({ createdAt: -1 })
      .limit(sanitizedLimit)
      .lean()
      .exec();

    if (persisted.length > 0) {
      return persisted.map((item) => ({
        id: item.errorId,
        timestamp: item.createdAt ?? new Date(),
        statusCode: item.statusCode,
        method: item.method,
        url: item.url,
        correlationId: item.correlationId,
        userId: item.userId,
        errorMessage: item.errorMessage,
      }));
    }

    return this.buffer.slice(0, sanitizedLimit);
  }

  async clear(): Promise<void> {
    this.buffer.length = 0;
    await this.errorLogModel.deleteMany({}).exec();
  }
}
