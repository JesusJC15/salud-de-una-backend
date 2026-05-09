import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Specialty } from '../../common/enums/specialty.enum';
import { TriageQuestionSet } from '../schemas/triage-question-set.schema';
import { TriageQuestionsRepository } from './triage-questions.repository';

describe('TriageQuestionsRepository', () => {
  let repository: TriageQuestionsRepository;
  let questionSetModel: { findOne: jest.Mock };

  beforeEach(async () => {
    questionSetModel = {
      findOne: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      }),
    };

    const module = await Test.createTestingModule({
      providers: [
        TriageQuestionsRepository,
        {
          provide: getModelToken(TriageQuestionSet.name),
          useValue: questionSetModel,
        },
      ],
    }).compile();

    repository = module.get<TriageQuestionsRepository>(
      TriageQuestionsRepository,
    );
  });

  describe('getQuestionsBySpecialty (async, DB + fallback)', () => {
    it('falls back to hardcoded questions when DB returns null', async () => {
      const questions = await repository.getQuestionsBySpecialty(
        Specialty.GENERAL_MEDICINE,
      );

      expect(questions.length).toBeGreaterThan(0);
    });

    it('falls back to hardcoded questions when DB throws an error', async () => {
      questionSetModel.findOne.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(new Error('connection lost')),
      });

      const questions = await repository.getQuestionsBySpecialty(
        Specialty.GENERAL_MEDICINE,
      );

      expect(questions.length).toBeGreaterThan(0);
    });

    it('returns DB questions when available', async () => {
      const dbQuestions = [
        {
          id: 'DB-Q1',
          questionId: 'DB-Q1',
          title: 'DB Question',
          questionText: 'From DB?',
          type: 'SINGLE_CHOICE',
        },
      ];
      questionSetModel.findOne.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue({ questions: dbQuestions }),
      });

      const questions = await repository.getQuestionsBySpecialty(
        Specialty.GENERAL_MEDICINE,
      );
      expect(questions[0].questionId).toBe('DB-Q1');
    });

    it('returns cloned questions so mutations do not affect subsequent reads', async () => {
      const questions = await repository.getQuestionsBySpecialty(
        Specialty.GENERAL_MEDICINE,
      );
      const firstQuestionId = questions[0].questionId;

      questions[0].questionText = 'mutated';
      const secondRead = await repository.getQuestionsBySpecialty(
        Specialty.GENERAL_MEDICINE,
      );

      expect(secondRead[0].questionId).toBe(firstQuestionId);
      expect(secondRead[0].questionText).not.toBe('mutated');
    });
  });

  describe('getRequiredQuestionIdsSync (hardcoded catalog)', () => {
    it('returns required question ids preserving catalog order', () => {
      const ids = repository.getRequiredQuestionIdsSync(Specialty.ODONTOLOGY);
      expect(ids).toEqual(['OD-Q1', 'OD-Q2', 'OD-Q3', 'OD-Q4', 'OD-Q5']);
    });

    it('returns URGENT_CARE question ids', () => {
      const ids = repository.getRequiredQuestionIdsSync(Specialty.URGENT_CARE);
      expect(ids).toEqual(['UR-Q1', 'UR-Q2', 'UR-Q3', 'UR-Q4', 'UR-Q5']);
    });
  });

  describe('getQuestionById (async)', () => {
    it('finds a question by id', async () => {
      const question = await repository.getQuestionById(
        Specialty.ODONTOLOGY,
        'OD-Q2',
      );
      expect(question?.questionText).toBeDefined();
    });

    it('returns undefined for unknown question id', async () => {
      const question = await repository.getQuestionById(
        Specialty.ODONTOLOGY,
        'OD-UNKNOWN',
      );
      expect(question).toBeUndefined();
    });
  });

  describe('isQuestionValid (async)', () => {
    it('returns true for valid question id', async () => {
      expect(
        await repository.isQuestionValid(Specialty.GENERAL_MEDICINE, 'MG-Q3'),
      ).toBe(true);
    });

    it('returns false for question id from wrong specialty', async () => {
      expect(
        await repository.isQuestionValid(Specialty.GENERAL_MEDICINE, 'OD-Q3'),
      ).toBe(false);
    });
  });
});
