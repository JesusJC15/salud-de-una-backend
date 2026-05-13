import { ForbiddenException, UsePipes, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConnectedSocket,
  Ack,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { extractSocketToken } from '../common/utils/socket-auth.util';
import { RequestUser } from '../common/interfaces/request-user.interface';
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

type ChatSendAck =
  | { ok: true; message: unknown }
  | { ok: false; code: string; message: string };

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
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer()
  private server!: Server;
  private readonly eventBudget = new Map<
    string,
    { count: number; resetAt: number }
  >();

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    private readonly chatService: ChatService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    if (!this.isAllowedOrigin(client.handshake.headers.origin)) {
      this.rejectUnauthorizedClient(client, 'Origen no permitido');
      return;
    }

    const token = extractSocketToken(client);
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
      this.enforceEventRateLimit(user.userId, 'chat:join');
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
    @Ack() ack?: (response: ChatSendAck) => void,
  ) {
    const user = await this.getAuthenticatedUser(client);
    if (!user) {
      return;
    }

    try {
      this.enforceEventRateLimit(user.userId, 'chat:send');
      const message = await this.chatService.sendMessage(
        dto.consultationId,
        user,
        dto.content,
        dto.clientMessageId,
      );
      this.server
        .to(this.toRoom(dto.consultationId))
        .emit('chat:message', message);
      ack?.({ ok: true, message });
    } catch (error) {
      const payload = this.toErrorPayload(error);
      client.emit('chat:error', payload);
      ack?.({ ok: false, ...payload });
    }
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

  private isAllowedOrigin(origin?: string | string[]) {
    if (!origin) {
      return true;
    }

    const normalizedOrigin = Array.isArray(origin) ? origin[0] : origin;
    const allowedOrigins = [
      ...(this.configService.get<string[]>('web.corsOriginsPatient') ?? []),
      ...(this.configService.get<string[]>('web.corsOriginsStaff') ?? []),
    ];

    if (
      allowedOrigins.length === 0 &&
      (this.configService.get<string>('NODE_ENV') ?? 'development') !==
        'production'
    ) {
      return true;
    }

    return allowedOrigins.includes(normalizedOrigin);
  }

  private enforceEventRateLimit(userId: string, eventName: string) {
    const key = `${userId}:${eventName}`;
    const now = Date.now();
    const windowMs = 10_000;
    const limit = eventName === 'chat:send' ? 20 : 40;
    const current = this.eventBudget.get(key);

    if (!current || current.resetAt <= now) {
      this.eventBudget.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }

    if (current.count >= limit) {
      throw new ForbiddenException(
        `Rate limit excedido para el evento ${eventName}`,
      );
    }

    current.count += 1;
    this.eventBudget.set(key, current);
  }
}
