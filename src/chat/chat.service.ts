import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserRole } from '../common/enums/user-role.enum';
import { RequestUser } from '../common/interfaces/request-user.interface';
import {
  Consultation,
  ConsultationDocument,
} from '../consultations/schemas/consultation.schema';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ConsultationMessage,
  ConsultationMessageDocument,
} from './schemas/consultation-message.schema';

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(ConsultationMessage.name)
    private readonly consultationMessageModel: Model<ConsultationMessageDocument>,
    @InjectModel(Consultation.name)
    private readonly consultationModel: Model<ConsultationDocument>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getMessages(consultationId: string, user: RequestUser, limit = 50) {
    const consultation = await this.assertCanAccessConsultation(
      consultationId,
      user,
    );
    const normalizedLimit = Math.min(Math.max(limit, 1), 200);

    const [items, total] = await Promise.all([
      this.consultationMessageModel
        .find({ consultationId: consultation._id })
        .sort({ createdAt: 1 })
        .limit(normalizedLimit)
        .lean()
        .exec(),
      this.consultationMessageModel
        .countDocuments({ consultationId: consultation._id })
        .exec(),
    ]);

    return {
      items: items.map((message) => this.toMessageResponse(message)),
      total,
    };
  }

  async getHistoryForSocket(consultationId: string, user: RequestUser) {
    const result = await this.getMessages(consultationId, user, 100);
    return result.items;
  }

  async sendMessage(
    consultationId: string,
    user: RequestUser,
    content: string,
    clientMessageId?: string,
  ) {
    const consultation = await this.assertCanAccessConsultation(
      consultationId,
      user,
    );

    if (consultation.status === 'CLOSED') {
      throw new ForbiddenException('La consulta ya esta cerrada');
    }

    const trimmedContent = content.trim();
    if (!trimmedContent) {
      throw new BadRequestException('El mensaje no puede estar vacio');
    }

    const [message] = await this.consultationMessageModel.create([
      {
        consultationId: consultation._id,
        senderId: new Types.ObjectId(user.userId),
        senderRole: user.role as UserRole.PATIENT | UserRole.DOCTOR,
        content: trimmedContent,
        type: 'TEXT',
      },
    ]);

    await this.notifyMessageRecipient(consultation, user, message);

    return {
      ...this.toMessageResponse(message),
      clientMessageId,
    };
  }

  private async notifyMessageRecipient(
    consultation: ConsultationDocument,
    sender: RequestUser,
    message: ConsultationMessageDocument,
  ) {
    if (sender.role === UserRole.DOCTOR) {
      await this.notificationsService.createUserNotification({
        userId: consultation.patientId.toString(),
        type: 'CHAT_MESSAGE',
        status: 'NEW',
        message: 'Tu medico envio un nuevo mensaje en la consulta.',
        resourceId: consultation.id,
        deepLink: `/triage/chat/${consultation.id}`,
        metadata: {
          consultationId: consultation.id,
          messageId: message.id,
        },
        push: {
          title: 'Nuevo mensaje medico',
          body: 'Tu medico envio un nuevo mensaje en la consulta.',
          data: {
            consultationId: consultation.id,
            deepLink: `/triage/chat/${consultation.id}`,
            type: 'CHAT_MESSAGE',
          },
        },
      });
      return;
    }

    if (consultation.assignedDoctorId) {
      await this.notificationsService.createUserNotification({
        userId: consultation.assignedDoctorId.toString(),
        type: 'CHAT_MESSAGE',
        status: 'NEW',
        message: 'El paciente envio un nuevo mensaje en la consulta.',
        resourceId: consultation.id,
        deepLink: `/doctor/consultations/${consultation.id}`,
        metadata: {
          consultationId: consultation.id,
          messageId: message.id,
        },
      });
    }
  }

  private async assertCanAccessConsultation(
    consultationId: string,
    user: RequestUser,
  ): Promise<ConsultationDocument> {
    if (!Types.ObjectId.isValid(consultationId)) {
      throw new NotFoundException('Consulta no encontrada');
    }

    const consultation = await this.consultationModel
      .findById(consultationId)
      .select('patientId assignedDoctorId status')
      .exec();

    if (!consultation) {
      throw new NotFoundException('Consulta no encontrada');
    }

    if (user.role === UserRole.ADMIN) {
      return consultation;
    }

    if (
      user.role === UserRole.PATIENT &&
      consultation.patientId.toString() === user.userId
    ) {
      return consultation;
    }

    if (
      user.role === UserRole.DOCTOR &&
      consultation.assignedDoctorId?.toString() === user.userId
    ) {
      return consultation;
    }

    throw new ForbiddenException('No tienes acceso a esta consulta');
  }

  private toMessageResponse(
    message:
      | ConsultationMessageDocument
      | (ConsultationMessage & { _id: Types.ObjectId; createdAt?: Date }),
  ) {
    const current = message as ConsultationMessageDocument;
    return {
      id: current._id.toString(),
      consultationId: current.consultationId.toString(),
      senderId: current.senderId.toString(),
      senderRole: current.senderRole,
      content: current.content,
      type: current.type,
      createdAt: current.createdAt?.toISOString() ?? new Date().toISOString(),
    };
  }
}
