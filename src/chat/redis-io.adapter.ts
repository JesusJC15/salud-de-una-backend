import { INestApplication } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { ServerOptions } from 'socket.io';

export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private readonly adapterConstructor: ReturnType<typeof createAdapter>;

  constructor(app: INestApplication, redisClient: Redis) {
    super(app);
    const pubClient = redisClient;
    const subClient = redisClient.duplicate();
    subClient.on('error', (error: Error) => {
      this.logger.warn(`Redis Socket.IO subscriber error: ${error.message}`);
    });
    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions): unknown {
    const server = super.createIOServer(port, options) as {
      adapter: (v: ReturnType<typeof createAdapter>) => void;
    };
    server.adapter(this.adapterConstructor);
    return server;
  }
}
