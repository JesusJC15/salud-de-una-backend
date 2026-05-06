import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { UserRole } from '../common/enums/user-role.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { Consultation } from '../consultations/schemas/consultation.schema';
import { ConsultationMessage } from './schemas/consultation-message.schema';
import { ChatService } from './chat.service';

describe('ChatService', () => {
  let service: ChatService;

  const consultationMessageModel = {
    find: jest.fn(),
    countDocuments: jest.fn(),
    create: jest.fn(),
  };

  const consultationModel = {
    findById: jest.fn(),
  };

  const notificationsService = {
    createUserNotification: jest.fn(),
  };

  const patientId = new Types.ObjectId();
  const doctorId = new Types.ObjectId();
  const consultationId = new Types.ObjectId();
  const messageId = new Types.ObjectId();

  const patientUser = {
    userId: patientId.toString(),
    role: UserRole.PATIENT,
    email: 'patient@test.com',
  };

  const doctorUser = {
    userId: doctorId.toString(),
    role: UserRole.DOCTOR,
    email: 'doctor@test.com',
  };

  const adminUser = {
    userId: new Types.ObjectId().toString(),
    role: UserRole.ADMIN,
    email: 'admin@test.com',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        {
          provide: getModelToken(ConsultationMessage.name),
          useValue: consultationMessageModel,
        },
        {
          provide: getModelToken(Consultation.name),
          useValue: consultationModel,
        },
        {
          provide: NotificationsService,
          useValue: notificationsService,
        },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  function consultationDoc(
    overrides: Partial<{
      _id: Types.ObjectId;
      id: string;
      patientId: Types.ObjectId;
      assignedDoctorId: Types.ObjectId | null;
      status: string;
    }> = {},
  ) {
    return {
      _id: consultationId,
      id: consultationId.toString(),
      patientId,
      assignedDoctorId: doctorId,
      status: 'IN_ATTENTION',
      ...overrides,
    };
  }

  function messageDoc(
    overrides: Partial<{
      _id: Types.ObjectId;
      consultationId: Types.ObjectId;
      senderId: Types.ObjectId;
      senderRole: UserRole;
      content: string;
      type: string;
      createdAt: Date;
      id: string;
    }> = {},
  ) {
    return {
      _id: messageId,
      id: messageId.toString(),
      consultationId,
      senderId: patientId,
      senderRole: UserRole.PATIENT,
      content: 'Hola doctor',
      type: 'TEXT',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      ...overrides,
    };
  }

  function mockConsultationLookup(doc: unknown) {
    consultationModel.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(doc),
    });
  }

  function mockMessageQuery(items: unknown[], total: number) {
    const limit = jest.fn().mockReturnThis();
    const sort = jest.fn().mockReturnValue({ limit });
    const lean = jest.fn().mockReturnThis();
    const exec = jest.fn().mockResolvedValue(items);

    limit.mockReturnValue({ lean, exec });
    consultationMessageModel.find.mockReturnValue({ sort });
    consultationMessageModel.countDocuments.mockReturnValue({
      exec: jest.fn().mockResolvedValue(total),
    });

    return { sort, limit };
  }

  describe('getMessages', () => {
    it('returns ordered message history for the owner patient', async () => {
      const message = messageDoc();
      mockConsultationLookup(consultationDoc());
      mockMessageQuery([message], 1);

      const result = await service.getMessages(
        consultationId.toString(),
        patientUser,
      );

      expect(result).toEqual({
        items: [
          {
            id: messageId.toString(),
            consultationId: consultationId.toString(),
            senderId: patientId.toString(),
            senderRole: UserRole.PATIENT,
            content: 'Hola doctor',
            type: 'TEXT',
            createdAt: '2025-01-01T00:00:00.000Z',
          },
        ],
        total: 1,
      });
    });

    it('clamps the requested limit to 200', async () => {
      mockConsultationLookup(consultationDoc());
      const query = mockMessageQuery([], 0);

      await service.getMessages(consultationId.toString(), patientUser, 999);

      expect(query.limit).toHaveBeenCalledWith(200);
    });

    it('clamps the requested limit to at least 1', async () => {
      mockConsultationLookup(consultationDoc());
      const query = mockMessageQuery([], 0);

      await service.getMessages(consultationId.toString(), patientUser, 0);

      expect(query.limit).toHaveBeenCalledWith(1);
    });

    it('allows admins to read any consultation', async () => {
      mockConsultationLookup(consultationDoc());
      mockMessageQuery([], 0);

      await expect(
        service.getMessages(consultationId.toString(), adminUser),
      ).resolves.toEqual({
        items: [],
        total: 0,
      });
    });

    it('throws NotFoundException when the consultation id is invalid', async () => {
      await expect(
        service.getMessages('invalid-id', patientUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the consultation does not exist', async () => {
      mockConsultationLookup(null);

      await expect(
        service.getMessages(consultationId.toString(), patientUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for unrelated users', async () => {
      mockConsultationLookup(consultationDoc());

      await expect(
        service.getMessages(consultationId.toString(), {
          userId: new Types.ObjectId().toString(),
          role: UserRole.PATIENT,
          email: 'other@test.com',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getHistoryForSocket', () => {
    it('returns only the items from getMessages', async () => {
      const getMessagesSpy = jest
        .spyOn(service, 'getMessages')
        .mockResolvedValue({
          items: [{ id: 'm1' }] as never[],
          total: 1,
        });

      await expect(
        service.getHistoryForSocket(consultationId.toString(), patientUser),
      ).resolves.toEqual([{ id: 'm1' }]);
      expect(getMessagesSpy).toHaveBeenCalledWith(
        consultationId.toString(),
        patientUser,
        100,
      );
    });
  });

  describe('sendMessage', () => {
    it('persists a trimmed patient message and notifies the assigned doctor', async () => {
      const consultation = consultationDoc();
      const message = messageDoc({
        senderId: patientId,
        senderRole: UserRole.PATIENT,
        content: 'Hola doctor',
      });
      mockConsultationLookup(consultation);
      consultationMessageModel.create.mockResolvedValue([message]);

      const result = await service.sendMessage(
        consultationId.toString(),
        patientUser,
        '  Hola doctor  ',
      );

      expect(consultationMessageModel.create).toHaveBeenCalledWith([
        {
          consultationId,
          senderId: new Types.ObjectId(patientUser.userId),
          senderRole: UserRole.PATIENT,
          content: 'Hola doctor',
          type: 'TEXT',
        },
      ]);
      expect(notificationsService.createUserNotification).toHaveBeenCalledWith({
        userId: doctorId.toString(),
        type: 'CHAT_MESSAGE',
        status: 'NEW',
        message: 'El paciente envio un nuevo mensaje en la consulta.',
        resourceId: consultationId.toString(),
        deepLink: `/doctor/consultations/${consultationId.toString()}`,
        metadata: {
          consultationId: consultationId.toString(),
          messageId: messageId.toString(),
        },
      });
      expect(result.content).toBe('Hola doctor');
    });

    it('sends push data when the assigned doctor writes to the patient', async () => {
      const consultation = consultationDoc();
      const doctorMessage = messageDoc({
        senderId: doctorId,
        senderRole: UserRole.DOCTOR,
        content: 'Revisa tu medicacion',
      });
      mockConsultationLookup(consultation);
      consultationMessageModel.create.mockResolvedValue([doctorMessage]);

      await service.sendMessage(
        consultationId.toString(),
        doctorUser,
        'Revisa tu medicacion',
      );

      expect(notificationsService.createUserNotification).toHaveBeenCalledWith({
        userId: patientId.toString(),
        type: 'CHAT_MESSAGE',
        status: 'NEW',
        message: 'Tu medico envio un nuevo mensaje en la consulta.',
        resourceId: consultationId.toString(),
        deepLink: `/triage/chat/${consultationId.toString()}`,
        metadata: {
          consultationId: consultationId.toString(),
          messageId: messageId.toString(),
        },
        push: {
          title: 'Nuevo mensaje medico',
          body: 'Tu medico envio un nuevo mensaje en la consulta.',
          data: {
            consultationId: consultationId.toString(),
            deepLink: `/triage/chat/${consultationId.toString()}`,
            type: 'CHAT_MESSAGE',
          },
        },
      });
    });

    it('does not notify a doctor when the consultation has no assigned doctor', async () => {
      mockConsultationLookup(
        consultationDoc({
          assignedDoctorId: null,
        }),
      );
      consultationMessageModel.create.mockResolvedValue([messageDoc()]);

      await service.sendMessage(
        consultationId.toString(),
        patientUser,
        'Hola doctor',
      );

      expect(
        notificationsService.createUserNotification,
      ).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for blank content', async () => {
      mockConsultationLookup(consultationDoc());

      await expect(
        service.sendMessage(consultationId.toString(), patientUser, '   '),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when the consultation is closed', async () => {
      mockConsultationLookup(
        consultationDoc({
          status: 'CLOSED',
        }),
      );

      await expect(
        service.sendMessage(
          consultationId.toString(),
          patientUser,
          'Mensaje tardio',
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
