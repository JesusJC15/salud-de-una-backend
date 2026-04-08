import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { ClientSession, Types } from 'mongoose';
import { Specialty } from '../common/enums/specialty.enum';
import { ConsultationsService } from './consultations.service';
import { Consultation } from './schemas/consultation.schema';

describe('ConsultationsService', () => {
  let service: ConsultationsService;

  const aggregateExecMock = jest.fn();
  const consultationModel = {
    create: jest.fn(),
    aggregate: jest.fn().mockReturnValue({
      exec: aggregateExecMock,
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    aggregateExecMock.mockResolvedValue([]);

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
    aggregateExecMock.mockResolvedValue([{ id: 'queue-1' }]);

    const result = await service.getQueue({ limit: 999, page: 0 });

    expect(result).toEqual({ items: [{ id: 'queue-1' }] });
    expect(consultationModel.aggregate).toHaveBeenCalledTimes(1);

    const [pipeline] = consultationModel.aggregate.mock.calls[0] as [
      Array<Record<string, unknown>>,
    ];
    expect(pipeline[3]).toEqual({ $skip: 0 });
    expect(pipeline[4]).toEqual({ $limit: 100 });
  });

  it('calculates skip using provided page and limit', async () => {
    aggregateExecMock.mockResolvedValue([]);

    await service.getQueue({ limit: 20, page: 3 });

    const [pipeline] = consultationModel.aggregate.mock.calls[0] as [
      Array<Record<string, unknown>>,
    ];
    expect(pipeline[3]).toEqual({ $skip: 40 });
    expect(pipeline[4]).toEqual({ $limit: 20 });
  });

  it('uses default pagination values when options are not provided', async () => {
    aggregateExecMock.mockResolvedValue([]);

    await service.getQueue();

    const [pipeline] = consultationModel.aggregate.mock.calls[0] as [
      Array<Record<string, unknown>>,
    ];
    expect(pipeline[3]).toEqual({ $skip: 0 });
    expect(pipeline[4]).toEqual({ $limit: 100 });
  });

  it('clamps limit to minimum value', async () => {
    aggregateExecMock.mockResolvedValue([]);

    await service.getQueue({ limit: -3, page: 2 });

    const [pipeline] = consultationModel.aggregate.mock.calls[0] as [
      Array<Record<string, unknown>>,
    ];
    expect(pipeline[3]).toEqual({ $skip: 1 });
    expect(pipeline[4]).toEqual({ $limit: 1 });
  });
});
