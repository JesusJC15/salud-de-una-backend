import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

function describeReadyState(readyState: number): string {
  switch (readyState) {
    case 0:
      return 'disconnected';
    case 1:
      return 'connected';
    case 2:
      return 'connecting';
    case 3:
      return 'disconnecting';
    default:
      return 'unknown';
  }
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
