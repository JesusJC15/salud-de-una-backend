import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../auth/auth.service';
import { UserRole } from '../common/enums/user-role.enum';
import { PatientsService } from './patients.service';
import { Patient } from './schemas/patient.schema';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

function createFindChain(result: unknown) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(result),
  };
}

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
  return {
    _id: { toString: () => '507f1f77bcf86cd799439011' },
    id: '507f1f77bcf86cd799439011',
    firstName: 'Ana',
    lastName: 'Lopez',
    email: 'ana@example.com',
    passwordHash: 'stored-hash',
    role: UserRole.PATIENT,
    birthDate: null,
    gender: 'FEMALE',
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    updatedAt: new Date('2026-03-02T00:00:00.000Z'),
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('PatientsService', () => {
  let service: PatientsService;
  let patientModel: {
    findById: jest.Mock;
  };
  let connection: {
    startSession: jest.Mock;
  };
  let authService: {
    ensureEmailIsAvailable: jest.Mock;
    revokeAllRefreshSessionsForUser: jest.Mock;
  };

  beforeEach(async () => {
    (bcrypt.compare as jest.Mock).mockReset();
    (bcrypt.hash as jest.Mock).mockReset();

    patientModel = {
      findById: jest.fn(),
    };

    connection = {
      startSession: jest.fn(),
    };

    authService = {
      ensureEmailIsAvailable: jest.fn(),
      revokeAllRefreshSessionsForUser: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientsService,
        { provide: getConnectionToken(), useValue: connection },
        { provide: getModelToken(Patient.name), useValue: patientModel },
        { provide: AuthService, useValue: authService },
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
      createFindChain({
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
    patientModel.findById.mockReturnValue(createFindChain(null));

    await expect(
      service.getMe({
        userId: 'missing',
        email: 'missing@example.com',
        role: UserRole.PATIENT,
        isActive: true,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updateMe should update profile and return patient', async () => {
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

  it('updateMe should update only email when currentPassword is valid', async () => {
    const patient = createPatientDocument();
    patientModel.findById.mockReturnValue(createDocumentQuery(patient));
    mockSession();
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const result = await service.updateMe(
      {
        userId: patient.id,
        email: patient.email,
        role: UserRole.PATIENT,
        isActive: true,
      },
      {
        email: '  Laura@Example.com  ',
        currentPassword: 'CurrentP@ss1',
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
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

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
        currentPassword: 'CurrentP@ss1',
      },
    );

    expect(result).toMatchObject({
      firstName: 'Laura',
      email: 'laura@example.com',
    });
  });

  it('updateMe should update password and revoke refresh sessions', async () => {
    const session = mockSession();
    const patient = createPatientDocument();
    patientModel.findById.mockReturnValue(createDocumentQuery(patient));
    (bcrypt.compare as jest.Mock)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');

    await service.updateMe(
      {
        userId: patient.id,
        email: patient.email,
        role: UserRole.PATIENT,
        isActive: true,
      },
      {
        currentPassword: 'CurrentP@ss1',
        newPassword: 'NuevaP@ss2',
      },
    );

    expect(patient.passwordHash).toBe('new-hash');
    expect(authService.revokeAllRefreshSessionsForUser).toHaveBeenCalledWith(
      patient.id,
      UserRole.PATIENT,
      'password_changed',
      session,
    );
  });

  it('updateMe should apply profile, email and password changes together', async () => {
    const patient = createPatientDocument();
    patientModel.findById.mockReturnValue(createDocumentQuery(patient));
    mockSession();
    (bcrypt.compare as jest.Mock)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');

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
        currentPassword: 'CurrentP@ss1',
        newPassword: 'NuevaP@ss2',
      },
    );

    expect(result).toMatchObject({
      firstName: 'Laura',
      email: 'laura@example.com',
    });
    expect(patient.passwordHash).toBe('new-hash');
  });

  it('updateMe should reject newPassword without currentPassword', async () => {
    const patient = createPatientDocument();
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
          newPassword: 'NuevaP@ss2',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updateMe should reject email change without currentPassword', async () => {
    const patient = createPatientDocument();
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
          email: 'laura@example.com',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updateMe should reject currentPassword without sensitive changes', async () => {
    const patient = createPatientDocument();
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
          currentPassword: 'CurrentP@ss1',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updateMe should reject incorrect currentPassword', async () => {
    const patient = createPatientDocument();
    patientModel.findById.mockReturnValue(createDocumentQuery(patient));
    mockSession();
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(
      service.updateMe(
        {
          userId: patient.id,
          email: patient.email,
          role: UserRole.PATIENT,
          isActive: true,
        },
        {
          email: 'laura@example.com',
          currentPassword: 'WrongP@ss1',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updateMe should reject same password as current one', async () => {
    const patient = createPatientDocument();
    patientModel.findById.mockReturnValue(createDocumentQuery(patient));
    mockSession();
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    await expect(
      service.updateMe(
        {
          userId: patient.id,
          email: patient.email,
          role: UserRole.PATIENT,
          isActive: true,
        },
        {
          currentPassword: 'CurrentP@ss1',
          newPassword: 'CurrentP@ss1',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updateMe should return conflict when email is already taken', async () => {
    const patient = createPatientDocument();
    patientModel.findById.mockReturnValue(createDocumentQuery(patient));
    mockSession();
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
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
          currentPassword: 'CurrentP@ss1',
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

  it('updateMe should ignore same normalized email without revoking sessions', async () => {
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

  it('updateMe should throw when patient not found', async () => {
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
});
