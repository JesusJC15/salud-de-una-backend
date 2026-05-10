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
import { extractSocketToken } from '../common/utils/socket-auth.util';
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
    origin: true,
    credentials: false,
  },
})
export class NotificationsGateway implements OnGatewayConnection {
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    @Optional()
    private readonly configService: ConfigService | null,
    private readonly authService: AuthService,
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

  private isAllowedOrigin(origin: string | string[] | undefined): boolean {
    const candidate = Array.isArray(origin) ? origin[0] : origin;
    if (!candidate) {
      return true;
    }

    const allowedOrigins = [
      ...(this.configService?.get<string[]>('web.corsOriginsPatient') ?? []),
      ...(this.configService?.get<string[]>('web.corsOriginsStaff') ?? []),
    ];

    return allowedOrigins.length === 0 || allowedOrigins.includes(candidate);
  }
}
