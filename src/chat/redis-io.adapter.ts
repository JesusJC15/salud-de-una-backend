import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { ServerOptions } from 'socket.io';

export class RedisIoAdapter extends IoAdapter {
  private readonly adapterConstructor: ReturnType<typeof createAdapter>;

  constructor(app: INestApplication, redisClient: Redis) {
    super(app);
    const pubClient = redisClient;
    const subClient = redisClient.duplicate();
    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions): unknown {
    // pingInterval 10 s + pingTimeout 5 s = 15 s total — well within
    // Railway's 30 s idle-connection timeout. Defaults (25 s + 20 s = 45 s)
    // exceed it, causing Railway to kill the socket before the ping round-trip.
    const server = super.createIOServer(port, {
      ...options,
      pingInterval: 10_000,
      pingTimeout: 5_000,
    }) as {
      adapter: (v: ReturnType<typeof createAdapter>) => void;
    };
    server.adapter(this.adapterConstructor);
    return server;
  }
}
