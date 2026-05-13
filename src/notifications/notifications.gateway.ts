import { Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConnectedSocket,
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import {
  buildSocketCorsOriginFn,
  extractSocketToken,
} from '../common/utils/socket-auth.util';
import { RequestUser } from '../common/interfaces/request-user.interface';

type SocketEventsMap = Record<string, (...args: unknown[]) => void>;

type AuthenticatedSocket = Socket<
  SocketEventsMap,
  SocketEventsMap,
  SocketEventsMap,
  { user?: RequestUser }
>;

@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: buildSocketCorsOriginFn(),
    credentials: true,
  },
})
export class NotificationsGateway implements OnGatewayConnection {
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private readonly authService: AuthService,
    @Optional()
    private readonly configService: ConfigService | null,
  ) {}

  async handleConnection(@ConnectedSocket() client: AuthenticatedSocket) {
    if (!this.isAllowedOrigin(client.handshake.headers.origin)) {
      client.disconnect();
      return;
    }

    const token = extractSocketToken(client);
    if (!token) {
      client.disconnect();
      return;
    }

    const user = await this.authService
      .authenticateAccessToken(token)
      .catch(() => null);

    if (!user) {
      client.disconnect();
      return;
    }

    client.data.user = user;
    await client.join(`user:${user.userId}`);
    this.logger.debug(`Notifications socket connected for user ${user.userId}`);
  }

  emitToUser(userId: string, notification: object): void {
    this.server.to(`user:${userId}`).emit('notification:new', notification);
  }

  private isAllowedOrigin(origin?: string | string[]) {
    if (!origin) {
      return true;
    }

    const normalizedOrigin = Array.isArray(origin) ? origin[0] : origin;
    const allowedOrigins = [
      ...(this.configService?.get<string[]>('web.corsOriginsPatient') ?? []),
      ...(this.configService?.get<string[]>('web.corsOriginsStaff') ?? []),
    ];

    if (
      allowedOrigins.length === 0 &&
      (this.configService?.get<string>('NODE_ENV') ?? 'development') !==
        'production'
    ) {
      return true;
    }

    return allowedOrigins.includes(normalizedOrigin);
  }
}
