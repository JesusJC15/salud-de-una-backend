import { ConflictException, NotFoundException } from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../auth/auth.service';
import { Transaction } from '../billing/schemas/transaction.schema';
import { UserRole } from '../common/enums/user-role.enum';
import { PatientTimelineService } from './patient-timeline.service';
import {
  createResolvedLeanQuery,
  createSelectLeanQuery,
  createTimelineModelProviders,
  EMPTY_TIMELINE_RESULT,
} from './patients.spec-helpers';
import { PatientsService } from './patients.service';
import { Patient } from './schemas/patient.schema';

function createDocumentQuery(result: unknown) {
  return {
    select: jest.fn().mockReturnThis(),
    session: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(result),
  };
}

function createPatientDocument(
  overrides: Partial<Record<string, unknown>> = {},
) {
  const passwordHash =
    typeof overrides.passwordHash === 'string'
      ? overrides.passwordHash
      : bcrypt.hashSync('StrongP@ss1', 4);

  return {
    _id: { toString: () => '507f1f77bcf86cd799439011' },
    id: '507f1f77bcf86cd799439011',
    firstName: 'Ana',
    lastName: 'Lopez',
    email: 'ana@example.com',
    role: UserRole.PATIENT,
    birthDate: null,
    gender: 'FEMALE',
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    updatedAt: new Date('2026-03-02T00:00:00.000Z'),
    passwordHash,
    isActive: true,
    isAnonymized: false,
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('PatientsService', () => {
  let service: PatientsService;
  let patientModel: { findById: jest.Mock; findByIdAndUpdate: jest.Mock };
  let consultationModel: { find: jest.Mock };
  let triageSessionModel: { find: jest.Mock };
  let followupModel: { find: jest.Mock };
  let transactionModel: { find: jest.Mock };
  let connection: { startSession: jest.Mock };
  let authService: {
    ensureEmailIsAvailable: jest.Mock;
    revokeAllRefreshSessionsForUser: jest.Mock;
  };
  let patientTimelineService: {
    getTimeline: jest.Mock;
  };

  beforeEach(async () => {
    patientModel = { findById: jest.fn(), findByIdAndUpdate: jest.fn() };
    consultationModel = {
      find: jest.fn().mockReturnValue(createResolvedLeanQuery([])),
    };
    triageSessionModel = {
      find: jest.fn().mockReturnValue(createResolvedLeanQuery([])),
    };
    followupModel = {
      find: jest.fn().mockReturnValue(createResolvedLeanQuery([])),
    };
    transactionModel = {
      find: jest.fn().mockReturnValue(createResolvedLeanQuery([])),
    };
    connection = { startSession: jest.fn() };
    authService = {
      ensureEmailIsAvailable: jest.fn(),
      revokeAllRefreshSessionsForUser: jest.fn(),
    };
    patientTimelineService = {
      getTimeline: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientsService,
        { provide: getConnectionToken(), useValue: connection },
        { provide: getModelToken(Patient.name), useValue: patientModel },
        ...createTimelineModelProviders({
          consultationModel,
          triageSessionModel,
          followupModel,
        }),
        {
          provide: getModelToken(Transaction.name),
          useValue: transactionModel,
        },
        { provide: AuthService, useValue: authService },
        {
          provide: PatientTimelineService,
          useValue: patientTimelineService,
        },
      ],
    }).compile();

    service = module.get<PatientsService>(PatientsService);
  });

  function mockSession() {
    const session = {
      withTransaction: jest.fn(async (callback: () => Promise<void>) =>
        callback(),
      ),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    connection.startSession.mockResolvedValue(session);
    return session;
  }

  it('getMe should return patient profile', async () => {
    patientModel.findById.mockReturnValue(
      createSelectLeanQuery({
        _id: '507f1f77bcf86cd799439011',
        firstName: 'Ana',
        lastName: 'Lopez',
        email: 'ana@example.com',
        role: UserRole.PATIENT,
        birthDate: null,
        gender: 'FEMALE',
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        updatedAt: new Date('2026-03-02T00:00:00.000Z'),
      }),
    );

    const result = await service.getMe({
      userId: '507f1f77bcf86cd799439011',
      email: 'ana@example.com',
      role: UserRole.PATIENT,
      isActive: true,
    });

    expect(result).toMatchObject({
      firstName: 'Ana',
      lastName: 'Lopez',
      email: 'ana@example.com',
      role: UserRole.PATIENT,
    });
  });

  it('getMe should throw when patient not found', async () => {
    patientModel.findById.mockReturnValue(createSelectLeanQuery(null));

    await expect(
      service.getMe({
        userId: 'missing',
        email: 'missing@example.com',
        role: UserRole.PATIENT,
        isActive: true,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updateMe should update profile fields and return patient', async () => {
    const session = mockSession();
    const patient = createPatientDocument();
    patientModel.findById.mockReturnValue(createDocumentQuery(patient));

    const result = await service.updateMe(
      {
        userId: patient.id,
        email: patient.email,
        role: UserRole.PATIENT,
        isActive: true,
      },
      {
        firstName: 'Laura',
        birthDate: '1998-03-10',
      },
    );

    expect(session.withTransaction).toHaveBeenCalled();
    expect(patient.save).toHaveBeenCalled();
    expect(result).toMatchObject({
      firstName: 'Laura',
      email: 'ana@example.com',
    });
    expect(patient.birthDate).toEqual(new Date('1998-03-10'));
    expect(authService.revokeAllRefreshSessionsForUser).not.toHaveBeenCalled();
  });

  it('updateMe should reject email changes without currentPassword', async () => {
    const session = mockSession();
    const patient = createPatientDocument();
    patientModel.findById.mockReturnValue(createDocumentQuery(patient));

    await expect(
      service.updateMe(
        {
          userId: patient.id,
          email: patient.email,
          role: UserRole.PATIENT,
          isActive: true,
        },
        {
          email: 'new@example.com',
        },
      ),
    ).rejects.toThrow('currentPassword es obligatorio para cambios sensibles');

    expect(session.withTransaction).toHaveBeenCalled();
  });

  it('updateMe should reject when the new password matches the current one', async () => {
    const session = mockSession();
    const patient = createPatientDocument({
      passwordHash: bcrypt.hashSync('StrongP@ss1', 4),
    });
    patientModel.findById.mockReturnValue(createDocumentQuery(patient));

    await expect(
      service.updateMe(
        {
          userId: patient.id,
          email: patient.email,
          role: UserRole.PATIENT,
          isActive: true,
        },
        {
          newPassword: 'StrongP@ss1',
          currentPassword: 'StrongP@ss1',
        },
      ),
    ).rejects.toThrow('La nueva contraseña debe ser diferente a la actual');

    expect(session.withTransaction).toHaveBeenCalled();
  });

  it('updateMe should update email when currentPassword is provided', async () => {
    const patient = createPatientDocument();
    patientModel.findById.mockReturnValue(createDocumentQuery(patient));
    mockSession();

    const result = await service.updateMe(
      {
        userId: patient.id,
        email: patient.email,
        role: UserRole.PATIENT,
        isActive: true,
      },
      {
        email: '  Laura@Example.com  ',
        currentPassword: 'StrongP@ss1',
      },
    );

    expect(authService.ensureEmailIsAvailable).toHaveBeenCalledWith(
      'laura@example.com',
    );
    expect(result.email).toBe('laura@example.com');
    expect(authService.revokeAllRefreshSessionsForUser).not.toHaveBeenCalled();
  });

  it('updateMe should update profile and email together', async () => {
    const patient = createPatientDocument();
    patientModel.findById.mockReturnValue(createDocumentQuery(patient));
    mockSession();

    const result = await service.updateMe(
      {
        userId: patient.id,
        email: patient.email,
        role: UserRole.PATIENT,
        isActive: true,
      },
      {
        firstName: 'Laura',
        email: 'laura@example.com',
        currentPassword: 'StrongP@ss1',
      },
    );

    expect(result).toMatchObject({
      firstName: 'Laura',
      email: 'laura@example.com',
    });
    expect(authService.revokeAllRefreshSessionsForUser).not.toHaveBeenCalled();
  });

  it('updateMe should throw ConflictException when email is already taken', async () => {
    const patient = createPatientDocument();
    patientModel.findById.mockReturnValue(createDocumentQuery(patient));
    mockSession();
    authService.ensureEmailIsAvailable.mockRejectedValue(
      new ConflictException('El correo ya está registrado'),
    );

    await expect(
      service.updateMe(
        {
          userId: patient.id,
          email: patient.email,
          role: UserRole.PATIENT,
          isActive: true,
        },
        {
          email: 'taken@example.com',
          currentPassword: 'StrongP@ss1',
        },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('updateMe should return current profile when payload is empty', async () => {
    const patient = createPatientDocument();
    patientModel.findById.mockReturnValue(createDocumentQuery(patient));
    mockSession();

    const result = await service.updateMe(
      {
        userId: patient.id,
        email: patient.email,
        role: UserRole.PATIENT,
        isActive: true,
      },
      {},
    );

    expect(result).toMatchObject({
      firstName: 'Ana',
      email: 'ana@example.com',
    });
    expect(authService.revokeAllRefreshSessionsForUser).not.toHaveBeenCalled();
  });

  it('updateMe should skip ensureEmailIsAvailable when email is unchanged (same after normalization)', async () => {
    const patient = createPatientDocument();
    patientModel.findById.mockReturnValue(createDocumentQuery(patient));
    mockSession();

    const result = await service.updateMe(
      {
        userId: patient.id,
        email: patient.email,
        role: UserRole.PATIENT,
        isActive: true,
      },
      {
        email: '  ANA@EXAMPLE.COM  ',
      },
    );

    expect(result.email).toBe('ana@example.com');
    expect(authService.ensureEmailIsAvailable).not.toHaveBeenCalled();
    expect(authService.revokeAllRefreshSessionsForUser).not.toHaveBeenCalled();
  });

  it('updateMe should throw ConflictException on duplicate email', async () => {
    const patient = createPatientDocument({
      save: jest
        .fn()
        .mockRejectedValue({ code: 11000, keyPattern: { email: 1 } }),
    });
    patientModel.findById.mockReturnValue(createDocumentQuery(patient));
    mockSession();

    await expect(
      service.updateMe(
        {
          userId: patient.id,
          email: patient.email,
          role: UserRole.PATIENT,
          isActive: true,
        },
        {
          email: 'taken@example.com',
          currentPassword: 'StrongP@ss1',
        },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('updateMe should throw NotFoundException when patient not found', async () => {
    patientModel.findById.mockReturnValue(createDocumentQuery(null));
    mockSession();

    await expect(
      service.updateMe(
        {
          userId: 'missing',
          email: 'missing@example.com',
          role: UserRole.PATIENT,
          isActive: true,
        },
        { firstName: 'Laura' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updatePushToken should append tokens without duplicates', async () => {
    const patient = createPatientDocument({
      pushTokens: ['ExponentPushToken[old]'],
      save: jest.fn().mockResolvedValue(undefined),
    });
    patientModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(patient),
    });

    const result = await service.updatePushToken(
      {
        userId: patient.id,
        email: patient.email,
        role: UserRole.PATIENT,
        isActive: true,
      },
      { token: 'ExponentPushToken[new]' },
    );

    expect(patient.save).toHaveBeenCalled();
    expect(result).toEqual({
      updated: true,
      tokensCount: 2,
    });
  });

  it('updatePushToken should throw when patient does not exist', async () => {
    patientModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });

    await expect(
      service.updatePushToken(
        {
          userId: 'missing',
          email: 'missing@example.com',
          role: UserRole.PATIENT,
          isActive: true,
        },
        { token: 'ExponentPushToken[new]' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getTimeline should delegate to patient timeline service', async () => {
    patientTimelineService.getTimeline.mockResolvedValue({
      ...EMPTY_TIMELINE_RESULT,
    });
    const user = {
      userId: '507f1f77bcf86cd799439011',
      email: 'ana@example.com',
      role: UserRole.PATIENT,
      isActive: true,
    };

    const result = await service.getTimeline(user, user.userId, { limit: 10 });

    expect(patientTimelineService.getTimeline).toHaveBeenCalledWith(
      user,
      user.userId,
      { limit: 10 },
    );
    expect(result).toEqual(EMPTY_TIMELINE_RESULT);
  });

  describe('exportPatientData', () => {
    const user = {
      userId: '507f1f77bcf86cd799439011',
      email: 'ana@example.com',
      role: UserRole.PATIENT,
      isActive: true,
    };

    it('should return all patient data', async () => {
      const patientDoc = {
        _id: '507f1f77bcf86cd799439011',
        firstName: 'Ana',
        lastName: 'Lopez',
        email: 'ana@example.com',
        role: UserRole.PATIENT,
      };
      patientModel.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(patientDoc),
      });

      const result = await service.exportPatientData(user);

      expect(result).toMatchObject({
        patient: { email: 'ana@example.com' },
        consultations: [],
        triageSessions: [],
        followups: [],
      });
      expect(result.exportedAt).toBeInstanceOf(Date);
    });

    it('should throw NotFoundException when patient not found', async () => {
      patientModel.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.exportPatientData(user)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('anonymizeAccount', () => {
    const user = {
      userId: '507f1f77bcf86cd799439011',
      email: 'ana@example.com',
      role: UserRole.PATIENT,
      isActive: true,
    };

    it('should anonymize the patient and revoke sessions', async () => {
      const patient = createPatientDocument();
      patientModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(patient),
      });

      await service.anonymizeAccount(user);

      expect(patient.firstName).toBe('Cuenta');
      expect(patient.lastName).toBe('Eliminada');
      expect(patient.email).toMatch(/^deleted-/);
      expect(patient.isActive).toBe(false);
      expect(patient.isAnonymized).toBe(true);
      expect(patient.save).toHaveBeenCalled();
      expect(authService.revokeAllRefreshSessionsForUser).toHaveBeenCalledWith(
        user.userId,
        UserRole.PATIENT,
        'account_deleted',
      );
    });

    it('should anonymize without a database session manager', async () => {
      const localService = new PatientsService(
        null,
        patientModel as never,
        consultationModel as never,
        triageSessionModel as never,
        followupModel as never,
        transactionModel as never,
        authService as never,
        patientTimelineService as never,
      );
      const patient = createPatientDocument();
      patientModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(patient),
      });

      await localService.anonymizeAccount(user);

      expect(patient.isAnonymized).toBe(true);
      expect(authService.revokeAllRefreshSessionsForUser).toHaveBeenCalledWith(
        user.userId,
        UserRole.PATIENT,
        'account_deleted',
      );
    });

    it('should fall back when the session object lacks transaction helpers', async () => {
      const patient = createPatientDocument();
      patientModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(patient),
      });
      connection.startSession.mockResolvedValue({});

      await service.anonymizeAccount(user);

      expect(patient.isAnonymized).toBe(true);
      expect(authService.revokeAllRefreshSessionsForUser).toHaveBeenCalledWith(
        user.userId,
        UserRole.PATIENT,
        'account_deleted',
      );
    });

    it('should throw NotFoundException when patient not found', async () => {
      patientModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.anonymizeAccount(user)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
