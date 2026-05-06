import { UsePipes, ValidationPipe } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { RequestUser } from '../common/interfaces/request-user.interface';
import { ChatJoinDto } from './dto/chat-join.dto';
import { ChatSendDto } from './dto/chat-send.dto';
import { ChatService } from './chat.service';

type SocketEventsMap = Record<string, (...args: unknown[]) => void>;

type AuthenticatedSocket = Socket<
  SocketEventsMap,
  SocketEventsMap,
  SocketEventsMap,
  { user?: RequestUser }
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
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly authService: AuthService,
    private readonly chatService: ChatService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    const token = this.extractToken(client);
    if (!token) {
      client.emit('chat:error', {
        code: 'UNAUTHORIZED',
        message: 'Token ausente',
      });
      client.disconnect();
      return;
    }

    try {
      client.data.user = await this.authService.authenticateAccessToken(token);
    } catch {
      client.emit('chat:error', {
        code: 'UNAUTHORIZED',
        message: 'Token invalido',
      });
      client.disconnect();
    }
  }

  @SubscribeMessage('chat:join')
  async handleJoin(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: ChatJoinDto,
  ) {
    const user = client.data.user;
    if (!user) {
      client.emit('chat:error', {
        code: 'UNAUTHORIZED',
        message: 'Sesion no valida',
      });
      client.disconnect();
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
    const user = client.data.user;
    if (!user) {
      client.emit('chat:error', {
        code: 'UNAUTHORIZED',
        message: 'Sesion no valida',
      });
      client.disconnect();
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

  private toRoom(consultationId: string) {
    return `consultation:${consultationId}`;
  }

  private toErrorPayload(error: unknown) {
    return {
      code: 'FORBIDDEN',
      message: error instanceof Error ? error.message : 'Error de mensajeria',
    };
  }
}
