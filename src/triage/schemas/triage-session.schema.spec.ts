import mongoose, { model, Types } from 'mongoose';
import { Specialty } from '../../common/enums/specialty.enum';
import { TriageSession, TriageSessionSchema } from './triage-session.schema';

describe('TriageSessionSchema', () => {
  const modelName = 'TriageSessionSchemaSpec';
  const TriageSessionModel = model<TriageSession>(
    modelName,
    TriageSessionSchema,
  );

  afterAll(() => {
    mongoose.deleteModel(modelName);
  });

  it('should set IN_PROGRESS as default status', () => {
    const doc = new TriageSessionModel({
      patientId: new Types.ObjectId(),
      specialty: Specialty.GENERAL_MEDICINE,
    });

    expect(doc.status).toBe('IN_PROGRESS');
  });

  it('should enforce enum validation for status', () => {
    const doc = new TriageSessionModel({
      patientId: new Types.ObjectId(),
      specialty: Specialty.GENERAL_MEDICINE,
      status: 'INVALID_STATUS',
    });

    const error = doc.validateSync();

    expect(error).toBeDefined();
    expect(error?.errors.status).toBeDefined();
    expect((error?.errors.status as Error).message).toContain(
      'not a valid enum value for path `status`',
    );
  });

  it('should enforce enum validation for analysis priority and red flag specialty', () => {
    const doc = new TriageSessionModel({
      patientId: new Types.ObjectId(),
      specialty: Specialty.GENERAL_MEDICINE,
      analysis: {
        priority: 'URGENT',
        redFlags: [
          {
            code: 'RF-MG-001',
            specialty: 'DENTISTRY',
            severity: 'CRITICAL',
            evidence: 'test',
          },
        ],
        analysisDurationMs: 20,
        guardrailApplied: false,
      },
    });

    const error = doc.validateSync();

    expect(error).toBeDefined();
    expect(error?.errors['analysis.priority']).toBeDefined();
    expect(error?.errors['analysis.redFlags.0.specialty']).toBeDefined();
  });

  it('should define indexes for query and active-session uniqueness', () => {
    const indexes = TriageSessionSchema.indexes();

    expect(indexes).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([{ patientId: 1, status: 1 }]),
        expect.arrayContaining([
          { patientId: 1, specialty: 1 },
          expect.objectContaining({
            unique: true,
            partialFilterExpression: { status: 'IN_PROGRESS' },
          }),
        ]),
      ]),
    );
  });
});
