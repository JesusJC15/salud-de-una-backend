import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

const READY_STATE_DESCRIPTIONS: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

function describeReadyState(readyState: number): string {
  return READY_STATE_DESCRIPTIONS[readyState] ?? 'unknown';
}

type HealthStatus = {
  status: 'ok';
  service: string;
  timestamp: string;
  uptimeSeconds: number;
};

type ReadinessStatus = {
  status: 'ready' | 'not_ready';
  service: string;
  timestamp: string;
  checks: {
    database: {
      status: 'up' | 'down';
      detail: string;
    };
  };
};

@Injectable()
export class AppService {
  constructor(@InjectConnection() private readonly dbConnection: Connection) {}

  getHealth(): HealthStatus {
    return {
      status: 'ok',
      service: 'salud-de-una-backend',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  getReadiness(): ReadinessStatus {
    const readyState = Number(this.dbConnection.readyState);
    const isDatabaseUp = readyState === 1;

    return {
      status: isDatabaseUp ? 'ready' : 'not_ready',
      service: 'salud-de-una-backend',
      timestamp: new Date().toISOString(),
      checks: {
        database: {
          status: isDatabaseUp ? 'up' : 'down',
          detail: `mongoose readyState: ${readyState} (${describeReadyState(readyState)})`,
        },
      },
    };
  }
}
