import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { AiService } from './ai/ai.service';
import { describeReadyState } from './common/utils/mongo-ready-state.util';
import { getRuntimeRole } from './common/utils/runtime-role.util';
import { RedisHealthService } from './redis/redis-health.service';

type HealthStatus = {
  status: 'ok';
  service: string;
  timestamp: string;
  uptimeSeconds: number;
  runtimeRole: string;
};

type ReadinessStatus = {
  status: 'ready' | 'not_ready';
  service: string;
  timestamp: string;
  runtimeRole: string;
  checks: {
    database: {
      status: 'up' | 'down';
      detail: string;
    };
    redis: {
      status: 'up' | 'down' | 'disabled';
      detail: string;
      latencyMs: number | null;
      degraded: boolean;
    };
    ai: {
      status: 'up' | 'degraded' | 'disabled';
      detail: string;
      degraded: boolean;
    };
  };
};

@Injectable()
export class AppService {
  constructor(
    @InjectConnection() private readonly dbConnection: Connection,
    private readonly redisHealthService: RedisHealthService,
    private readonly aiService: AiService,
  ) {}

  getHealth(): HealthStatus {
    return {
      status: 'ok',
      service: 'salud-de-una-backend',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      runtimeRole: getRuntimeRole(),
    };
  }

  async getReadiness(): Promise<ReadinessStatus> {
    const readyState = Number(this.dbConnection.readyState);
    const isDatabaseUp = readyState === 1;
    const redisReadiness = await this.redisHealthService.getReadiness();
    const aiReadiness = this.aiService.getReadiness();
    const isProduction = process.env.NODE_ENV === 'production';
    const status =
      isDatabaseUp && (!isProduction || redisReadiness.status === 'up')
        ? 'ready'
        : 'not_ready';

    return {
      status,
      service: 'salud-de-una-backend',
      timestamp: new Date().toISOString(),
      runtimeRole: getRuntimeRole(),
      checks: {
        database: {
          status: isDatabaseUp ? 'up' : 'down',
          detail: `mongoose readyState: ${readyState} (${describeReadyState(readyState)})`,
        },
        redis: redisReadiness,
        ai: aiReadiness,
      },
    };
  }
}
