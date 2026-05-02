import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';

type JoinPayload = { consultationId: string };
type SendPayload = { consultationId: string; content: string };

interface SocketUser {
  userId: string;
  role: string;
}

interface TypedSocketData {
  user?: SocketUser;
}

function getSocketUser(client: Socket): SocketUser | undefined {
  return (client.data as TypedSocketData).user;
}

@WebSocketGateway({
  namespace: 'chat',
  cors: { origin: '*', credentials: true },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(private readonly chatService: ChatService) {}

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token as string | undefined;

    if (!token) {
      this.logger.warn(`WS connection rejected — no token | id=${client.id}`);
      client.disconnect();
      return;
    }

    try {
      const user = await this.chatService.validateWsToken(token);
      (client.data as TypedSocketData).user = user;
      this.logger.log(
        `WS connected | id=${client.id} | userId=${user.userId} | role=${user.role}`,
      );
    } catch {
      this.logger.warn(
        `WS connection rejected — invalid token | id=${client.id}`,
      );
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`WS disconnected | id=${client.id}`);
  }

  @SubscribeMessage('chat:join')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinPayload,
  ) {
    const user = getSocketUser(client);
    if (!user) {
      client.emit('chat:error', {
        code: 'UNAUTHORIZED',
        message: 'No autenticado',
      });
      return;
    }

    const { consultationId } = payload;
    if (!consultationId) {
      client.emit('chat:error', {
        code: 'INVALID_PAYLOAD',
        message: 'consultationId requerido',
      });
      return;
    }

    try {
      await this.chatService.validateAccess(
        consultationId,
        user.userId,
        user.role,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sin acceso';
      client.emit('chat:error', { code: 'FORBIDDEN', message });
      return;
    }

    const room = `consultation:${consultationId}`;
    await client.join(room);

    const history = await this.chatService.getMessageHistory(consultationId);
    client.emit('chat:history', { messages: history });

    this.logger.log(`WS join | id=${client.id} | room=${room}`);
  }

  @SubscribeMessage('chat:send')
  async handleSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SendPayload,
  ) {
    const user = getSocketUser(client);
    if (!user) {
      client.emit('chat:error', {
        code: 'UNAUTHORIZED',
        message: 'No autenticado',
      });
      return;
    }

    const { consultationId, content } = payload;
    if (!consultationId || !content?.trim()) {
      client.emit('chat:error', {
        code: 'INVALID_PAYLOAD',
        message: 'consultationId y content requeridos',
      });
      return;
    }

    if (content.trim().length > 2000) {
      client.emit('chat:error', {
        code: 'CONTENT_TOO_LONG',
        message: 'Mensaje demasiado largo (máx 2000 caracteres)',
      });
      return;
    }

    try {
      await this.chatService.validateAccess(
        consultationId,
        user.userId,
        user.role,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sin acceso';
      client.emit('chat:error', { code: 'FORBIDDEN', message });
      return;
    }

    const senderRole: 'DOCTOR' | 'PATIENT' =
      user.role === 'DOCTOR' ? 'DOCTOR' : 'PATIENT';
    const savedMessage = await this.chatService.saveMessage(
      consultationId,
      user.userId,
      senderRole,
      content,
    );

    const room = `consultation:${consultationId}`;
    this.server.to(room).emit('chat:message', savedMessage);

    this.logger.log(
      `WS message sent | room=${room} | senderId=${user.userId} | chars=${content.length}`,
    );
  }
}
