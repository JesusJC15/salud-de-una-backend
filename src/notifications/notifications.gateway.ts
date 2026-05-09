import { Logger } from '@nestjs/common';
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
    credentials: true,
  },
})
export class NotificationsGateway implements OnGatewayConnection {
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(private readonly authService: AuthService) {}

  async handleConnection(@ConnectedSocket() client: AuthenticatedSocket) {
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
}
