import { Types } from 'mongoose';
import { Consultation } from '../../../src/consultations/schemas/consultation.schema';
import { TriageSession } from '../../../src/triage/schemas/triage-session.schema';
import {
  buildGeneralMedicineAnswers,
  buildOdontologyAnswers,
} from '../support/builders';
import type { AnalyzeTriageSessionResponseBody } from '../support/contracts';
import { E2eTestContext } from '../support/e2e-harness';
import {
  createTriageSession,
  registerPatientAndLogin,
  saveTriageAnswers,
} from '../support/flows';

describe('E2E Triage / Analysis With Rule-Based Fallback', () => {
  let context: E2eTestContext;

  beforeAll(async () => {
    context = await E2eTestContext.create();
  });

  beforeEach(async () => {
    await context.resetState();
  });

  afterAll(async () => {
    await context.close();
  });

  it('returns 422 when trying to analyze an incomplete session', async () => {
    const { session } = await registerPatientAndLogin(context, {
      firstName: 'Monica',
      lastName: 'Gil',
      email: 'triage-analyze-incomplete@example.com',
      password: 'StrongP@ss1',
    });
    const created = await createTriageSession(
      context,
      session.accessToken,
      'ODONTOLOGY',
    );

    await context
      .request()
      .post(`/v1/triage/sessions/${created.sessionId}/analyze`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(422);
  });

  it('falls back to RULE_BASED when AI is disabled', async () => {
    const { session } = await registerPatientAndLogin(context, {
      firstName: 'Laura',
      lastName: 'Saenz',
      email: 'triage-analyze-failed@example.com',
      password: 'StrongP@ss1',
    });
    const created = await createTriageSession(
      context,
      session.accessToken,
      'GENERAL_MEDICINE',
    );

    await saveTriageAnswers(
      context,
      session.accessToken,
      created.sessionId,
      buildGeneralMedicineAnswers(),
    );

    const analyzeResponse = await context
      .request()
      .post(`/v1/triage/sessions/${created.sessionId}/analyze`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);

    const analyzeBody =
      analyzeResponse.body as AnalyzeTriageSessionResponseBody;
    expect(analyzeBody.analysisMode).toBe('RULE_BASED');
    expect(analyzeBody.noticeCode).toBe(
      'IA_NOT_IMPLEMENTED_RULE_BASED_FALLBACK',
    );

    const triageSessionModel = context.getModel(TriageSession.name);
    const consultationModel = context.getModel(Consultation.name);

    const triageSession = (await triageSessionModel
      .findById(created.sessionId)
      .lean()
      .exec()) as {
      status?: string;
    } | null;
    expect(triageSession?.status).toBe('COMPLETED');

    const consultation = await consultationModel
      .findOne({ triageSessionId: new Types.ObjectId(created.sessionId) })
      .lean()
      .exec();
    expect(consultation).toBeDefined();
  });

  it('completes the session and creates a consultation', async () => {
    const { session } = await registerPatientAndLogin(context, {
      firstName: 'Erika',
      lastName: 'Nuñez',
      email: 'triage-analyze-success@example.com',
      password: 'StrongP@ss1',
    });
    const created = await createTriageSession(
      context,
      session.accessToken,
      'ODONTOLOGY',
    );

    await saveTriageAnswers(
      context,
      session.accessToken,
      created.sessionId,
      buildOdontologyAnswers(),
    );

    const analyzeResponse = await context
      .request()
      .post(`/v1/triage/sessions/${created.sessionId}/analyze`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);

    const analyzeBody =
      analyzeResponse.body as AnalyzeTriageSessionResponseBody;
    expect(analyzeBody).toMatchObject({
      sessionId: created.sessionId,
      priority: 'MODERATE',
      highPriorityAlert: false,
    });
    expect(typeof analyzeBody.message).toBe('string');
    expect(Array.isArray(analyzeBody.redFlags)).toBe(true);

    const triageSessionModel = context.getModel(TriageSession.name);
    const consultationModel = context.getModel(Consultation.name);

    const triageSession = (await triageSessionModel
      .findById(created.sessionId)
      .lean()
      .exec()) as {
      status?: string;
      analysis?: {
        priority?: string;
        analysisDurationMs?: number;
      };
    } | null;
    expect(triageSession?.status).toBe('COMPLETED');
    expect(triageSession?.analysis?.priority).toBe('MODERATE');
    expect(triageSession?.analysis?.analysisDurationMs).toBeGreaterThanOrEqual(
      0,
    );

    const consultation = await consultationModel
      .findOne({ triageSessionId: new Types.ObjectId(created.sessionId) })
      .lean()
      .exec();
    expect(consultation).toMatchObject({
      specialty: 'ODONTOLOGY',
      priority: 'MODERATE',
      status: 'PENDING',
    });
  });
});
