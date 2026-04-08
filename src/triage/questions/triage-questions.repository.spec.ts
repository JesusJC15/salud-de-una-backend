import { Specialty } from '../../common/enums/specialty.enum';
import { TriageQuestionsRepository } from './triage-questions.repository';

describe('TriageQuestionsRepository', () => {
  let repository: TriageQuestionsRepository;

  beforeEach(() => {
    repository = new TriageQuestionsRepository();
  });

  it('returns cloned questions for the requested specialty', () => {
    const questions = repository.getQuestionsBySpecialty(
      Specialty.GENERAL_MEDICINE,
    );

    expect(questions.length).toBeGreaterThan(0);
    const firstQuestionId = questions[0].questionId;

    questions[0].questionText = 'mutated';
    const secondRead = repository.getQuestionsBySpecialty(
      Specialty.GENERAL_MEDICINE,
    );

    expect(secondRead[0].questionId).toBe(firstQuestionId);
    expect(secondRead[0].questionText).not.toBe('mutated');
  });

  it('finds a question by id and returns undefined when missing', () => {
    expect(
      repository.getQuestionById(Specialty.ODONTOLOGY, 'OD-Q2')?.questionText,
    ).toBeDefined();

    expect(
      repository.getQuestionById(Specialty.ODONTOLOGY, 'OD-UNKNOWN'),
    ).toBeUndefined();
  });

  it('validates question ids by specialty', () => {
    expect(
      repository.isQuestionValid(Specialty.GENERAL_MEDICINE, 'MG-Q3'),
    ).toBe(true);
    expect(
      repository.isQuestionValid(Specialty.GENERAL_MEDICINE, 'OD-Q3'),
    ).toBe(false);
  });

  it('returns required question ids preserving catalog order', () => {
    const ids = repository.getRequiredQuestionIds(Specialty.ODONTOLOGY);

    expect(ids).toEqual(['OD-Q1', 'OD-Q2', 'OD-Q3', 'OD-Q4', 'OD-Q5']);
  });
});
