import { Inject, Optional, UsePipes, ValidationPipe } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { RequestUser } from '../common/interfaces/request-user.interface';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { ChatJoinDto } from './dto/chat-join.dto';
import { ChatSendDto } from './dto/chat-send.dto';
import { ChatService } from './chat.service';

type SocketEventsMap = Record<string, (...args: unknown[]) => void>;

type AuthenticatedSocket = Socket<
  SocketEventsMap,
  SocketEventsMap,
  SocketEventsMap,
  { user?: RequestUser; authPromise?: Promise<RequestUser | null> }
>;

@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: true,
    credentials: true,
  },
})
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
  }),
)
export class ChatGateway implements OnGatewayConnection, OnGatewayInit {
  @WebSocketServer()
  private server!: Server;

  constructor(
    @Optional()
    @Inject(REDIS_CLIENT)
    private readonly redisClient: Redis | null,
    private readonly authService: AuthService,
    private readonly chatService: ChatService,
  ) {}

  afterInit(server: Server): void {
    if (this.redisClient) {
      const pubClient = this.redisClient;
      const subClient = this.redisClient.duplicate();
      server.adapter(createAdapter(pubClient, subClient));
    }
  }

  async handleConnection(client: AuthenticatedSocket) {
    const token = this.extractToken(client);
    if (!token) {
      this.rejectUnauthorizedClient(client, 'Token ausente');
      return;
    }

    client.data.authPromise = this.authService
      .authenticateAccessToken(token)
      .then((user) => {
        client.data.user = user;
        return user;
      })
      .catch(() => {
        this.rejectUnauthorizedClient(client, 'Token invalido');
        return null;
      });

    await client.data.authPromise;
  }

  @SubscribeMessage('chat:join')
  async handleJoin(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: ChatJoinDto,
  ) {
    const user = await this.getAuthenticatedUser(client);
    if (!user) {
      return;
    }

    try {
      await client.join(this.toRoom(dto.consultationId));
      const messages = await this.chatService.getHistoryForSocket(
        dto.consultationId,
        user,
      );
      client.emit('chat:history', { messages });
    } catch (error) {
      client.emit('chat:error', this.toErrorPayload(error));
    }
  }

  @SubscribeMessage('chat:send')
  async handleSend(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: ChatSendDto,
  ) {
    const user = await this.getAuthenticatedUser(client);
    if (!user) {
      return;
    }

    try {
      const message = await this.chatService.sendMessage(
        dto.consultationId,
        user,
        dto.content,
      );
      this.server
        .to(this.toRoom(dto.consultationId))
        .emit('chat:message', message);
    } catch (error) {
      client.emit('chat:error', this.toErrorPayload(error));
    }
  }

  private extractToken(client: Socket): string | null {
    const auth = client.handshake.auth as Record<string, unknown> | undefined;
    const authToken = auth?.token;
    if (typeof authToken === 'string' && authToken.trim().length > 0) {
      return authToken.trim();
    }

    const authorization = client.handshake.headers.authorization;
    if (
      typeof authorization === 'string' &&
      authorization.toLowerCase().startsWith('bearer ')
    ) {
      return authorization.slice(7).trim();
    }

    return null;
  }

  private async getAuthenticatedUser(
    client: AuthenticatedSocket,
  ): Promise<RequestUser | null> {
    if (client.data.user) {
      return client.data.user;
    }

    if (client.data.authPromise) {
      return client.data.authPromise;
    }

    this.rejectUnauthorizedClient(client, 'Sesion no valida');
    return null;
  }

  private toRoom(consultationId: string) {
    return `consultation:${consultationId}`;
  }

  private rejectUnauthorizedClient(
    client: AuthenticatedSocket,
    message: string,
  ) {
    client.emit('chat:error', {
      code: 'UNAUTHORIZED',
      message,
    });
    client.disconnect();
  }

  private toErrorPayload(error: unknown) {
    return {
      code: 'FORBIDDEN',
      message: error instanceof Error ? error.message : 'Error de mensajeria',
    };
  }
}
