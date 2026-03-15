import { NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { PatientsService } from './patients.service';
import { Patient } from './schemas/patient.schema';

function createFindChain(result: unknown) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(result),
  };
}

describe('PatientsService', () => {
  let service: PatientsService;
  const patientModel = {
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientsService,
        { provide: getModelToken(Patient.name), useValue: patientModel },
      ],
    }).compile();

    service = module.get<PatientsService>(PatientsService);
  });

  it('getMe should return patient profile', async () => {
    patientModel.findById.mockReturnValue(
      createFindChain({
        _id: '507f1f77bcf86cd799439011',
        firstName: 'Ana',
        lastName: 'Lopez',
        email: 'ana@example.com',
        role: 'PATIENT',
        birthDate: null,
        gender: 'FEMALE',
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        updatedAt: new Date('2026-03-02T00:00:00.000Z'),
      }),
    );

    const result = await service.getMe({
      userId: '507f1f77bcf86cd799439011',
      email: 'ana@example.com',
      role: 'PATIENT',
      isActive: true,
    });

    expect(result).toMatchObject({
      firstName: 'Ana',
      lastName: 'Lopez',
      email: 'ana@example.com',
      role: 'PATIENT',
    });
  });

  it('getMe should throw when patient not found', async () => {
    patientModel.findById.mockReturnValue(createFindChain(null));
    await expect(
      service.getMe({
        userId: 'missing',
        email: 'missing@example.com',
        role: 'PATIENT',
        isActive: true,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updateMe should update profile and return patient', async () => {
    patientModel.findByIdAndUpdate.mockReturnValue(
      createFindChain({
        _id: '507f1f77bcf86cd799439011',
        firstName: 'Laura',
        lastName: 'Lopez',
        email: 'ana@example.com',
        role: 'PATIENT',
        birthDate: new Date('1998-03-10T00:00:00.000Z'),
        gender: 'FEMALE',
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        updatedAt: new Date('2026-03-02T00:00:00.000Z'),
      }),
    );

    const result = await service.updateMe(
      {
        userId: '507f1f77bcf86cd799439011',
        email: 'ana@example.com',
        role: 'PATIENT',
        isActive: true,
      },
      {
        firstName: 'Laura',
        birthDate: '1998-03-10',
      },
    );

    expect(result).toMatchObject({
      firstName: 'Laura',
      email: 'ana@example.com',
    });
  });

  it('updateMe should update only gender', async () => {
    patientModel.findByIdAndUpdate.mockReturnValue(
      createFindChain({
        _id: '507f1f77bcf86cd799439011',
        firstName: 'Ana',
        lastName: 'Lopez',
        email: 'ana@example.com',
        role: 'PATIENT',
        birthDate: null,
        gender: 'MALE',
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        updatedAt: new Date('2026-03-02T00:00:00.000Z'),
      }),
    );
    const result = await service.updateMe(
      {
        userId: '507f1f77bcf86cd799439011',
        email: 'ana@example.com',
        role: 'PATIENT',
        isActive: true,
      },
      {
        gender: 'MALE',
      },
    );
    expect(result.gender).toBe('MALE');
  });

  it('updateMe should update only lastName', async () => {
    patientModel.findByIdAndUpdate.mockReturnValue(
      createFindChain({
        _id: '507f1f77bcf86cd799439011',
        firstName: 'Ana',
        lastName: 'Martinez',
        email: 'ana@example.com',
        role: 'PATIENT',
        birthDate: null,
        gender: 'FEMALE',
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        updatedAt: new Date('2026-03-02T00:00:00.000Z'),
      }),
    );
    const result = await service.updateMe(
      {
        userId: '507f1f77bcf86cd799439011',
        email: 'ana@example.com',
        role: 'PATIENT',
        isActive: true,
      },
      {
        lastName: 'Martinez',
      },
    );
    expect(result.lastName).toBe('Martinez');
  });

  it('updateMe should not update any field if dto is empty', async () => {
    patientModel.findByIdAndUpdate.mockReturnValue(
      createFindChain({
        _id: '507f1f77bcf86cd799439011',
        firstName: 'Ana',
        lastName: 'Lopez',
        email: 'ana@example.com',
        role: 'PATIENT',
        birthDate: null,
        gender: 'FEMALE',
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        updatedAt: new Date('2026-03-02T00:00:00.000Z'),
      }),
    );
    const result = await service.updateMe(
      {
        userId: '507f1f77bcf86cd799439011',
        email: 'ana@example.com',
        role: 'PATIENT',
        isActive: true,
      },
      {},
    );
    expect(result.firstName).toBe('Ana');
    expect(result.lastName).toBe('Lopez');
  });

  it('updateMe should throw when patient not found', async () => {
    patientModel.findByIdAndUpdate.mockReturnValue(createFindChain(null));

    await expect(
      service.updateMe(
        {
          userId: 'missing',
          email: 'missing@example.com',
          role: 'PATIENT',
          isActive: true,
        },
        { firstName: 'Laura' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
