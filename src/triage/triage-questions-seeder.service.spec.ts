import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Specialty } from '../common/enums/specialty.enum';
import { TriageQuestionSet } from './schemas/triage-question-set.schema';
import { TriageQuestionsSeederService } from './triage-questions-seeder.service';

describe('TriageQuestionsSeederService', () => {
  let service: TriageQuestionsSeederService;
  let questionSetModel: { findOne: jest.Mock; create: jest.Mock };

  beforeEach(async () => {
    questionSetModel = {
      findOne: jest.fn(),
      create: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TriageQuestionsSeederService,
        {
          provide: getModelToken(TriageQuestionSet.name),
          useValue: questionSetModel,
        },
      ],
    }).compile();

    service = module.get<TriageQuestionsSeederService>(
      TriageQuestionsSeederService,
    );
  });

  it('seeds all three specialties when none exist', async () => {
    questionSetModel.findOne.mockReturnValue({
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(null),
    });

    await service.onApplicationBootstrap();

    expect(questionSetModel.create).toHaveBeenCalledTimes(3);
    expect(questionSetModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ specialty: Specialty.GENERAL_MEDICINE }),
    );
    expect(questionSetModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ specialty: Specialty.URGENT_CARE }),
    );
  });

  it('skips specialties that already exist', async () => {
    questionSetModel.findOne.mockReturnValue({
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue({
        specialty: Specialty.GENERAL_MEDICINE,
        version: 1,
      }),
    });

    await service.onApplicationBootstrap();

    expect(questionSetModel.create).not.toHaveBeenCalled();
  });

  it('seeds only missing specialties when some already exist', async () => {
    questionSetModel.findOne
      .mockReturnValueOnce({
        lean: jest.fn().mockReturnThis(),
        exec: jest
          .fn()
          .mockResolvedValue({ specialty: Specialty.GENERAL_MEDICINE }),
      })
      .mockReturnValue({
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      });

    await service.onApplicationBootstrap();

    expect(questionSetModel.create).toHaveBeenCalledTimes(2);
  });
});
