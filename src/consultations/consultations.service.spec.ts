import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { ClientSession, Types } from 'mongoose';
import { Specialty } from '../common/enums/specialty.enum';
import { ConsultationsService } from './consultations.service';
import { Consultation } from './schemas/consultation.schema';

describe('ConsultationsService', () => {
  let service: ConsultationsService;

  const findExecMock = jest.fn();
  const findChain = {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: findExecMock,
  };

  const consultationModel = {
    create: jest.fn(),
    find: jest.fn().mockReturnValue(findChain),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    findExecMock.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConsultationsService,
        {
          provide: getModelToken(Consultation.name),
          useValue: consultationModel,
        },
      ],
    }).compile();

    service = module.get<ConsultationsService>(ConsultationsService);
  });

  it('creates consultation using string ids without session', async () => {
    consultationModel.create.mockResolvedValue([]);

    await service.createFromTriage({
      patientId: new Types.ObjectId().toString(),
      triageSessionId: new Types.ObjectId().toString(),
      specialty: Specialty.GENERAL_MEDICINE,
      priority: 'HIGH',
    });

    expect(consultationModel.create).toHaveBeenCalledTimes(1);
    const [payload, options] = consultationModel.create.mock.calls[0] as [
      Array<{
        patientId: Types.ObjectId;
        triageSessionId: Types.ObjectId;
      }>,
      unknown,
    ];

    expect(payload[0].patientId).toBeInstanceOf(Types.ObjectId);
    expect(payload[0].triageSessionId).toBeInstanceOf(Types.ObjectId);
    expect(options).toBeUndefined();
  });

  it('creates consultation using object ids with session', async () => {
    consultationModel.create.mockResolvedValue([]);
    const patientId = new Types.ObjectId();
    const triageSessionId = new Types.ObjectId();
    const session = { id: 'tx-1' } as unknown as ClientSession;

    await service.createFromTriage(
      {
        patientId,
        triageSessionId,
        specialty: Specialty.ODONTOLOGY,
        priority: 'LOW',
      },
      session,
    );

    expect(consultationModel.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          patientId,
          triageSessionId,
          specialty: Specialty.ODONTOLOGY,
          priority: 'LOW',
          status: 'PENDING',
        }),
      ],
      { session },
    );
  });

  it('returns paginated queue using clamped defaults', async () => {
    const consultationId = new Types.ObjectId();
    const patientId = new Types.ObjectId();
    const triageSessionId = new Types.ObjectId();
    findExecMock.mockResolvedValue([
      {
        _id: consultationId,
        patientId,
        triageSessionId,
        specialty: Specialty.GENERAL_MEDICINE,
        priority: 'MODERATE',
        status: 'PENDING',
        createdAt: null,
      },
    ]);

    const result = await service.getQueue({ limit: 999, page: 0 });

    expect(result).toEqual({
      items: [
        {
          id: consultationId.toString(),
          patientId: patientId.toString(),
          triageSessionId: triageSessionId.toString(),
          specialty: Specialty.GENERAL_MEDICINE,
          priority: 'MODERATE',
          status: 'PENDING',
          createdAt: null,
        },
      ],
    });
    expect(consultationModel.find).toHaveBeenCalledWith({ status: 'PENDING' });
    expect(findChain.select).toHaveBeenCalledWith(
      '_id patientId triageSessionId specialty priority status createdAt',
    );
  });

  it('calculates skip using provided page and limit', async () => {
    const baseDate = new Date('2026-04-07T00:00:00.000Z');
    findExecMock.mockResolvedValue([
      {
        _id: new Types.ObjectId(),
        patientId: new Types.ObjectId(),
        triageSessionId: new Types.ObjectId(),
        specialty: Specialty.GENERAL_MEDICINE,
        priority: 'HIGH',
        status: 'PENDING',
        createdAt: new Date(baseDate.getTime() + 1000),
      },
      {
        _id: new Types.ObjectId(),
        patientId: new Types.ObjectId(),
        triageSessionId: new Types.ObjectId(),
        specialty: Specialty.GENERAL_MEDICINE,
        priority: 'MODERATE',
        status: 'PENDING',
        createdAt: new Date(baseDate.getTime() + 2000),
      },
      {
        _id: new Types.ObjectId(),
        patientId: new Types.ObjectId(),
        triageSessionId: new Types.ObjectId(),
        specialty: Specialty.GENERAL_MEDICINE,
        priority: 'LOW',
        status: 'PENDING',
        createdAt: new Date(baseDate.getTime() + 3000),
      },
    ]);

    const result = await service.getQueue({ limit: 1, page: 2 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].priority).toBe('MODERATE');
  });

  it('uses default pagination values when options are not provided', async () => {
    findExecMock.mockResolvedValue([]);

    const result = await service.getQueue();

    expect(result).toEqual({ items: [] });
  });

  it('clamps limit to minimum value', async () => {
    findExecMock.mockResolvedValue([
      {
        _id: new Types.ObjectId(),
        patientId: new Types.ObjectId(),
        triageSessionId: new Types.ObjectId(),
        specialty: Specialty.GENERAL_MEDICINE,
        priority: 'HIGH',
        status: 'PENDING',
        createdAt: null,
      },
      {
        _id: new Types.ObjectId(),
        patientId: new Types.ObjectId(),
        triageSessionId: new Types.ObjectId(),
        specialty: Specialty.GENERAL_MEDICINE,
        priority: 'LOW',
        status: 'PENDING',
        createdAt: null,
      },
    ]);

    const result = await service.getQueue({ limit: -3, page: 2 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].priority).toBe('LOW');
  });

  it('uses createdAt as tie-breaker when priorities are equal', async () => {
    const older = new Date('2026-04-07T00:00:00.000Z');
    const newer = new Date('2026-04-08T00:00:00.000Z');
    const firstId = new Types.ObjectId();
    const secondId = new Types.ObjectId();

    findExecMock.mockResolvedValue([
      {
        _id: secondId,
        patientId: new Types.ObjectId(),
        triageSessionId: new Types.ObjectId(),
        specialty: Specialty.GENERAL_MEDICINE,
        priority: 'LOW',
        status: 'PENDING',
        createdAt: newer,
      },
      {
        _id: firstId,
        patientId: new Types.ObjectId(),
        triageSessionId: new Types.ObjectId(),
        specialty: Specialty.GENERAL_MEDICINE,
        priority: 'LOW',
        status: 'PENDING',
        createdAt: older,
      },
    ]);

    const result = await service.getQueue({ limit: 10, page: 1 });

    expect(result.items[0].id).toBe(firstId.toString());
    expect(result.items[1].id).toBe(secondId.toString());
  });

  it('sends unknown priorities to the end using fallback rank', async () => {
    const knownId = new Types.ObjectId();
    const unknownId = new Types.ObjectId();

    findExecMock.mockResolvedValue([
      {
        _id: unknownId,
        patientId: new Types.ObjectId(),
        triageSessionId: new Types.ObjectId(),
        specialty: Specialty.GENERAL_MEDICINE,
        priority: 'UNKNOWN' as unknown as 'LOW',
        status: 'PENDING',
        createdAt: null,
      },
      {
        _id: knownId,
        patientId: new Types.ObjectId(),
        triageSessionId: new Types.ObjectId(),
        specialty: Specialty.GENERAL_MEDICINE,
        priority: 'LOW',
        status: 'PENDING',
        createdAt: null,
      },
    ]);

    const result = await service.getQueue({ limit: 10, page: 1 });

    expect(result.items[0].id).toBe(knownId.toString());
    expect(result.items[1].id).toBe(unknownId.toString());
  });
});
