import { Specialty } from '../../common/enums/specialty.enum';
import { RedFlagsEngine } from '../engines/red-flags.engine';

describe('RedFlagsEngine', () => {
  const createAnswer = (questionId: string, answerValue: unknown) => ({
    questionId,
    questionText: questionId,
    answerValue,
    answeredAt: new Date(),
  });

  it('detects RF-MG-001 for chest pain plus breathing difficulty', () => {
    const result = RedFlagsEngine.evaluate(
      [
        createAnswer('MG-Q1', 'dolor toracico desde hoy'),
        createAnswer('MG-Q5', 'dificultad para respirar'),
      ],
      Specialty.GENERAL_MEDICINE,
    );

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'RF-MG-001', severity: 'CRITICAL' }),
      ]),
    );
  });

  it('detects RF-MG-002 for syncope or loss of consciousness', () => {
    const result = RedFlagsEngine.evaluate(
      [createAnswer('MG-Q1', 'tuve un sincope en la tarde')],
      Specialty.GENERAL_MEDICINE,
    );

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'RF-MG-002', severity: 'CRITICAL' }),
      ]),
    );
  });

  it('detects RF-MG-003 for fever over 39C plus neck stiffness', () => {
    const result = RedFlagsEngine.evaluate(
      [createAnswer('MG-Q1', 'fiebre de 40 c y rigidez de nuca')],
      Specialty.GENERAL_MEDICINE,
    );

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'RF-MG-003', severity: 'CRITICAL' }),
      ]),
    );
  });

  it('detects RF-MG-004 for sudden severe abdominal pain', () => {
    const result = RedFlagsEngine.evaluate(
      [createAnswer('MG-Q1', 'dolor abdominal intenso de inicio subito')],
      Specialty.GENERAL_MEDICINE,
    );

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'RF-MG-004', severity: 'CRITICAL' }),
      ]),
    );
  });

  it('detects RF-MG-005 for sudden visual disturbances', () => {
    const result = RedFlagsEngine.evaluate(
      [createAnswer('MG-Q1', 'presenta vision borrosa repentina')],
      Specialty.GENERAL_MEDICINE,
    );

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'RF-MG-005', severity: 'WARNING' }),
      ]),
    );
  });

  it('returns empty array when there are no matching risk combinations', () => {
    const result = RedFlagsEngine.evaluate(
      [
        createAnswer('MG-Q1', 'dolor muscular leve'),
        createAnswer('MG-Q2', '2 dias'),
      ],
      Specialty.GENERAL_MEDICINE,
    );

    expect(result).toEqual([]);
  });

  it('returns empty array for non general medicine specialties', () => {
    const result = RedFlagsEngine.evaluate(
      [createAnswer('OD-Q1', 'dolor dental')],
      Specialty.ODONTOLOGY,
    );

    expect(result).toEqual([]);
  });

  it('handles numeric, boolean and unsupported answer values safely', () => {
    const result = RedFlagsEngine.evaluate(
      [
        createAnswer('MG-Q1', 'fiebre de 40 c'),
        createAnswer('MG-Q3', 8),
        createAnswer('MG-Q4', 'rigidez de nuca'),
        createAnswer('MG-Q5', true),
        createAnswer('MG-Q2', { raw: 'unsupported' }),
      ],
      Specialty.GENERAL_MEDICINE,
    );

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'RF-MG-003', severity: 'CRITICAL' }),
      ]),
    );
  });

  it('returns empty array when normalized values are empty after parsing', () => {
    const result = RedFlagsEngine.evaluate(
      [createAnswer('MG-Q1', { text: 'unsupported-object' })],
      Specialty.GENERAL_MEDICINE,
    );

    expect(result).toEqual([]);
  });

  it('returns multiple flags when multiple combinations are present', () => {
    const result = RedFlagsEngine.evaluate(
      [
        createAnswer(
          'MG-Q1',
          'dolor toracico y dificultad para respirar, ademas fiebre de 40 c y rigidez de nuca',
        ),
        createAnswer('MG-Q2', 'inicio subito'),
      ],
      Specialty.GENERAL_MEDICINE,
    );

    const detectedCodes = result.map((flag) => flag.code);
    expect(detectedCodes).toEqual(
      expect.arrayContaining(['RF-MG-001', 'RF-MG-003']),
    );
    expect(detectedCodes.length).toBeGreaterThanOrEqual(2);
  });

  it('deduplicates repeated codes if catalog contains duplicated rules', () => {
    const catalog = (
      RedFlagsEngine as unknown as {
        mgCatalog: {
          rules: Array<{
            code: string;
            severity: 'CRITICAL' | 'WARNING' | 'INFO';
            evidence: string;
            questionScope?: string[];
            allOf: Array<{ anyOf: string[] }>;
          }>;
        };
      }
    ).mgCatalog;

    const duplicateRule = {
      code: 'RF-MG-001',
      severity: 'CRITICAL' as const,
      evidence: 'Duplicated for test',
      questionScope: ['MG-Q1', 'MG-Q5'],
      allOf: [
        { anyOf: ['dolor\\s+torac'] },
        { anyOf: ['dificultad\\s+para\\s+respirar'] },
      ],
    };

    catalog.rules.push(duplicateRule);

    try {
      const result = RedFlagsEngine.evaluate(
        [
          createAnswer('MG-Q1', 'dolor toracico'),
          createAnswer('MG-Q5', 'dificultad para respirar'),
        ],
        Specialty.GENERAL_MEDICINE,
      );

      expect(result.filter((flag) => flag.code === 'RF-MG-001')).toHaveLength(
        1,
      );
    } finally {
      catalog.rules.pop();
    }
  });
});
