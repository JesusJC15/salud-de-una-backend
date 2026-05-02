import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import type { JwtHeader, JwtPayload } from 'jsonwebtoken';
import * as jwt from 'jsonwebtoken';
import * as jwksRsa from 'jwks-rsa';
import { Model, Types } from 'mongoose';
import { ConsultationDocument } from '../consultations/schemas/consultation.schema';
import { Consultation } from '../consultations/schemas/consultation.schema';
import {
  ConsultationMessage,
  ConsultationMessageDocument,
} from './schemas/consultation-message.schema';

const NS = 'https://salud-de-una.com/';

export interface WsUser {
  userId: string;
  role: string;
  email: string;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly jwksClient: InstanceType<typeof jwksRsa.JwksClient>;
  private readonly domain: string;
  private readonly audience: string;

  constructor(
    configService: ConfigService,
    @InjectModel(ConsultationMessage.name)
    private readonly messageModel: Model<ConsultationMessageDocument>,
    @InjectModel(Consultation.name)
    private readonly consultationModel: Model<ConsultationDocument>,
  ) {
    this.domain =
      configService.get<string>('auth.auth0Domain') ?? 'placeholder.auth0.com';
    this.audience = configService.get<string>('auth.auth0Audience') ?? '';
    this.jwksClient = new jwksRsa.JwksClient({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: `https://${this.domain}/.well-known/jwks.json`,
    });
  }

  async validateWsToken(token: string): Promise<WsUser> {
    try {
      const decoded = jwt.decode(token, { complete: true }) as {
        header: JwtHeader;
        payload: JwtPayload & Record<string, unknown>;
      } | null;

      if (!decoded?.header?.kid) {
        throw new UnauthorizedException('Token inválido');
      }

      const signingKey = await this.jwksClient.getSigningKey(
        decoded.header.kid,
      );
      const publicKey = signingKey.getPublicKey();

      const payload = jwt.verify(token, publicKey, {
        algorithms: ['RS256'],
        issuer: `https://${this.domain}/`,
        audience: this.audience || undefined,
      }) as JwtPayload & Record<string, unknown>;

      const dbId = payload[`${NS}db_id`] as string | undefined;
      const role = (payload[`${NS}role`] as string | undefined) ?? 'PATIENT';
      const email =
        (payload[`${NS}email`] as string | undefined) ??
        (payload.email as string | undefined) ??
        '';

      if (!dbId) {
        throw new UnauthorizedException('Usuario no aprovisionado');
      }

      return { userId: dbId, role, email };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      this.logger.warn(`WS token validation failed: ${String(error)}`);
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }

  async validateAccess(
    consultationId: string,
    userId: string,
    role: string,
  ): Promise<ConsultationDocument> {
    const consultation = await this.consultationModel
      .findById(consultationId)
      .exec();

    if (!consultation) {
      throw new ForbiddenException('Consulta no encontrada');
    }

    if (consultation.status === 'CLOSED') {
      throw new ForbiddenException('La consulta está cerrada');
    }

    const isPatient =
      role === 'PATIENT' && consultation.patientId.toString() === userId;
    const isAssignedDoctor =
      role === 'DOCTOR' && consultation.assignedDoctorId?.toString() === userId;

    if (!isPatient && !isAssignedDoctor) {
      throw new ForbiddenException('Sin acceso a esta consulta');
    }

    return consultation;
  }

  async saveMessage(
    consultationId: string,
    senderId: string,
    senderRole: 'PATIENT' | 'DOCTOR',
    content: string,
  ) {
    const message = await this.messageModel.create({
      consultationId: new Types.ObjectId(consultationId),
      senderId: new Types.ObjectId(senderId),
      senderRole,
      content: content.trim(),
      type: 'TEXT',
    });

    return {
      id: message._id.toString(),
      consultationId,
      senderId,
      senderRole,
      content: message.content,
      type: message.type,
      createdAt: message.createdAt,
    };
  }

  async getMessageHistory(consultationId: string, limit = 50) {
    const messages = await this.messageModel
      .find({ consultationId: new Types.ObjectId(consultationId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    return messages.reverse().map((m) => ({
      id: m._id.toString(),
      consultationId: m.consultationId.toString(),
      senderId: m.senderId.toString(),
      senderRole: m.senderRole,
      content: m.content,
      type: m.type,
      createdAt: m.createdAt,
    }));
  }
}
