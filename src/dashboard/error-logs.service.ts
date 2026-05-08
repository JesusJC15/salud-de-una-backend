import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

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
  private readonly buffer: ErrorLogEntry[] = [];
  private readonly MAX_SIZE = 50;

  append(entry: Omit<ErrorLogEntry, 'id' | 'timestamp'>): void {
    this.buffer.unshift({ ...entry, id: randomUUID(), timestamp: new Date() });
    if (this.buffer.length > this.MAX_SIZE) {
      this.buffer.pop();
    }
  }

  getRecent(limit = 20): ErrorLogEntry[] {
    return this.buffer.slice(0, Math.min(limit, this.MAX_SIZE));
  }

  clear(): void {
    this.buffer.length = 0;
  }
}
