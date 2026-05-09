import { Specialty } from '../../common/enums/specialty.enum';
import type { TriageAnswer } from '../schemas/triage-session.schema';
import { RedFlagsEngine } from './red-flags.engine';

function makeAnswer(questionId: string, answerValue: unknown): TriageAnswer {
  return {
    questionId,
    questionText: '',
    answerValue,
    answeredAt: new Date(),
  };
}

describe('RedFlagsEngine.evaluate', () => {
  describe('ODONTOLOGY', () => {
    it('returns RF-OD-001 when patient reports inflammation or bleeding', () => {
      const answers = [
        makeAnswer('OD-Q3', 3),
        makeAnswer('OD-Q4', 'Si'),
        makeAnswer('OD-Q5', 'No'),
      ];
      const flags = RedFlagsEngine.evaluate(answers, Specialty.ODONTOLOGY);
      expect(flags.some((f) => f.code === 'RF-OD-001')).toBe(true);
    });

    it('returns RF-OD-002 when pain intensity >= 8', () => {
      const answers = [makeAnswer('OD-Q3', 9), makeAnswer('OD-Q4', 'No')];
      const flags = RedFlagsEngine.evaluate(answers, Specialty.ODONTOLOGY);
      expect(flags.some((f) => f.code === 'RF-OD-002')).toBe(true);
    });

    it('returns RF-OD-003 when thermal sensitivity reported', () => {
      const answers = [
        makeAnswer('OD-Q3', 4),
        makeAnswer('OD-Q4', 'No'),
        makeAnswer('OD-Q5', 'Si'),
      ];
      const flags = RedFlagsEngine.evaluate(answers, Specialty.ODONTOLOGY);
      expect(flags.some((f) => f.code === 'RF-OD-003')).toBe(true);
    });

    it('returns no flags when all values are benign', () => {
      const answers = [
        makeAnswer('OD-Q3', 2),
        makeAnswer('OD-Q4', 'No'),
        makeAnswer('OD-Q5', 'No'),
      ];
      const flags = RedFlagsEngine.evaluate(answers, Specialty.ODONTOLOGY);
      expect(flags).toHaveLength(0);
    });
  });

  describe('URGENT_CARE', () => {
    it('returns RF-UR-001 (CRITICAL) when patient cannot breathe', () => {
      const answers = [
        makeAnswer('UR-Q3', 'No puedo respirar bien'),
        makeAnswer('UR-Q4', 'No hay sangrado'),
      ];
      const flags = RedFlagsEngine.evaluate(answers, Specialty.URGENT_CARE);
      expect(flags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'RF-UR-001', severity: 'CRITICAL' }),
        ]),
      );
    });

    it('returns RF-UR-003 (WARNING) when breathing with difficulty', () => {
      const answers = [
        makeAnswer('UR-Q3', 'Con cierta dificultad'),
        makeAnswer('UR-Q4', 'No hay sangrado'),
      ];
      const flags = RedFlagsEngine.evaluate(answers, Specialty.URGENT_CARE);
      expect(flags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'RF-UR-003', severity: 'WARNING' }),
        ]),
      );
    });

    it('returns RF-UR-002 (CRITICAL) when abundant bleeding reported', () => {
      const answers = [
        makeAnswer('UR-Q3', 'Si, con normalidad'),
        makeAnswer('UR-Q4', 'Si sangrado abundante'),
      ];
      const flags = RedFlagsEngine.evaluate(answers, Specialty.URGENT_CARE);
      expect(flags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'RF-UR-002', severity: 'CRITICAL' }),
        ]),
      );
    });

    it('accepts alternative form "si, sangrado abundante"', () => {
      const answers = [
        makeAnswer('UR-Q3', 'Si, con normalidad'),
        makeAnswer('UR-Q4', 'Si, sangrado abundante'),
      ];
      const flags = RedFlagsEngine.evaluate(answers, Specialty.URGENT_CARE);
      expect(flags.some((f) => f.code === 'RF-UR-002')).toBe(true);
    });

    it('returns no flags when breathing is normal and no bleeding', () => {
      const answers = [
        makeAnswer('UR-Q3', 'Si, con normalidad'),
        makeAnswer('UR-Q4', 'No hay sangrado'),
      ];
      const flags = RedFlagsEngine.evaluate(answers, Specialty.URGENT_CARE);
      expect(flags).toHaveLength(0);
    });
  });

  describe('GENERAL_MEDICINE', () => {
    it('returns empty array when no rules match', () => {
      const answers = [makeAnswer('MG-Q1', 'Headache'), makeAnswer('MG-Q3', 1)];
      const flags = RedFlagsEngine.evaluate(
        answers,
        Specialty.GENERAL_MEDICINE,
      );
      expect(Array.isArray(flags)).toBe(true);
    });
  });

  it('returns empty array for unknown specialty', () => {
    const flags = RedFlagsEngine.evaluate([], 'UNKNOWN' as Specialty);
    expect(flags).toHaveLength(0);
  });
});
