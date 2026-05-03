import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { Consultation } from '../consultations/schemas/consultation.schema';
import { ConsultationMessage } from './schemas/consultation-message.schema';
import { ChatService } from './chat.service';

jest.mock('jwks-rsa', () => ({
  JwksClient: jest.fn().mockImplementation(() => ({
    getSigningKey: jest
      .fn()
      .mockResolvedValue({ getPublicKey: () => 'mock-public-key' }),
  })),
}));

const LEGACY_SECRET = 'test-legacy-secret';

function makeLegacyToken(overrides: Record<string, unknown> = {}) {
  return jwt.sign(
    {
      sub: 'user-id-1',
      role: 'PATIENT',
      email: 'p@test.com',
      tokenType: 'access',
      ...overrides,
    },
    LEGACY_SECRET,
    { algorithm: 'HS256' },
  );
}

describe('ChatService', () => {
  let service: ChatService;

  const consultationModel = {
    findById: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'auth.auth0Domain') return 'test.auth0.com';
              if (key === 'auth.auth0Audience') return 'test-audience';
              if (key === 'auth.jwtSecret') return LEGACY_SECRET;
              return undefined;
            },
          },
        },
        {
          provide: getModelToken(ConsultationMessage.name),
          useValue: { create: jest.fn(), find: jest.fn() },
        },
        {
          provide: getModelToken(Consultation.name),
          useValue: consultationModel,
        },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  // ─── validateWsToken ─────────────────────────────────────────────────────

  describe('validateWsToken', () => {
    it('rejects null/unparseable tokens', async () => {
      await expect(service.validateWsToken('not.a.jwt')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects expired legacy tokens', async () => {
      const expired = jwt.sign(
        { sub: 'u1', role: 'PATIENT', email: 'x@y.com', tokenType: 'access' },
        LEGACY_SECRET,
        { algorithm: 'HS256', expiresIn: -1 },
      );
      await expect(service.validateWsToken(expired)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects legacy tokens with wrong secret', async () => {
      const wrongSecret = jwt.sign(
        { sub: 'u1', role: 'PATIENT', email: 'x@y.com', tokenType: 'access' },
        'wrong-secret',
        { algorithm: 'HS256' },
      );
      await expect(service.validateWsToken(wrongSecret)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('validates a valid legacy token and returns WsUser', async () => {
      const token = makeLegacyToken();
      const user = await service.validateWsToken(token);
      expect(user).toEqual({
        userId: 'user-id-1',
        role: 'PATIENT',
        email: 'p@test.com',
      });
    });

    it('returns DOCTOR role from legacy token', async () => {
      const token = makeLegacyToken({
        sub: 'doc-1',
        role: 'DOCTOR',
        email: 'd@test.com',
      });
      const user = await service.validateWsToken(token);
      expect(user.role).toBe('DOCTOR');
      expect(user.userId).toBe('doc-1');
    });

    it('rejects legacy token without sub', async () => {
      const token = jwt.sign(
        { role: 'PATIENT', email: 'x@y.com', tokenType: 'access' },
        LEGACY_SECRET,
        { algorithm: 'HS256' },
      );
      await expect(service.validateWsToken(token)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ─── validateAccess ───────────────────────────────────────────────────────

  describe('validateAccess', () => {
    const patientId = new Types.ObjectId();
    const doctorId = new Types.ObjectId();

    function makeConsultation(status: string) {
      return {
        _id: new Types.ObjectId(),
        patientId,
        assignedDoctorId: doctorId,
        status,
      };
    }

    function chainFor(doc: unknown) {
      return { exec: jest.fn().mockResolvedValue(doc) };
    }

    it('throws ForbiddenException when consultation not found', async () => {
      consultationModel.findById.mockReturnValue(chainFor(null));
      await expect(
        service.validateAccess('id', patientId.toString(), 'PATIENT'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows patient join on IN_ATTENTION consultation', async () => {
      consultationModel.findById.mockReturnValue(
        chainFor(makeConsultation('IN_ATTENTION')),
      );
      await expect(
        service.validateAccess('id', patientId.toString(), 'PATIENT', 'join'),
      ).resolves.toBeDefined();
    });

    it('allows patient join on CLOSED consultation (history view)', async () => {
      consultationModel.findById.mockReturnValue(
        chainFor(makeConsultation('CLOSED')),
      );
      await expect(
        service.validateAccess('id', patientId.toString(), 'PATIENT', 'join'),
      ).resolves.toBeDefined();
    });

    it('blocks patient send on CLOSED consultation', async () => {
      consultationModel.findById.mockReturnValue(
        chainFor(makeConsultation('CLOSED')),
      );
      await expect(
        service.validateAccess('id', patientId.toString(), 'PATIENT', 'send'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException for unrelated user', async () => {
      consultationModel.findById.mockReturnValue(
        chainFor(makeConsultation('IN_ATTENTION')),
      );
      const otherId = new Types.ObjectId().toString();
      await expect(
        service.validateAccess('id', otherId, 'PATIENT', 'join'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows assigned doctor join', async () => {
      consultationModel.findById.mockReturnValue(
        chainFor(makeConsultation('IN_ATTENTION')),
      );
      await expect(
        service.validateAccess('id', doctorId.toString(), 'DOCTOR', 'join'),
      ).resolves.toBeDefined();
    });
  });
});
