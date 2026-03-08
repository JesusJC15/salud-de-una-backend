import { Injectable } from '@nestjs/common';
import { connection } from 'mongoose';

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
  getHealth(): HealthStatus {
    return {
      status: 'ok',
      service: 'salud-de-una-backend',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  getReadiness(): ReadinessStatus {
    const isDatabaseUp = Number(connection.readyState) === 1;

    return {
      status: isDatabaseUp ? 'ready' : 'not_ready',
      service: 'salud-de-una-backend',
      timestamp: new Date().toISOString(),
      checks: {
        database: {
          status: isDatabaseUp ? 'up' : 'down',
          detail: `mongoose readyState: ${connection.readyState}`,
        },
      },
    };
  }
}
