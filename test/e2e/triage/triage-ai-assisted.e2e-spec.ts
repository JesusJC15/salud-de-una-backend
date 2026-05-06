import { TriageSession } from '../../../src/triage/schemas/triage-session.schema';
import {
  buildGeneralMedicineAnswers,
  buildHighPriorityGeneralMedicineAnswers,
  buildOdontologyAnswers,
} from '../support/builders';
import type { AnalyzeTriageSessionResponseBody } from '../support/contracts';
import { E2eTestContext } from '../support/e2e-harness';
import {
  createTriageSession,
  registerPatientAndLogin,
  saveTriageAnswers,
} from '../support/flows';

describe('E2E Triage / AI Assisted Analysis', () => {
  let aiResponseText = JSON.stringify({
    priority: 'LOW',
    summary: 'Prioridad baja, continuar observacion y seguimiento.',
  });
  let context: E2eTestContext;

  beforeAll(async () => {
    context = await E2eTestContext.create({
      aiEnabled: true,
      aiOverride: {
        generateText: jest.fn(() =>
          Promise.resolve({
            provider: 'mock-gemini',
            model: 'mock-model',
            text: aiResponseText,
            latencyMs: 5,
            requestId: 'mock-request-id',
          }),
        ),
        healthCheck: jest.fn(() =>
          Promise.resolve({
            provider: 'mock-gemini',
            model: 'mock-model',
            status: 'up',
            latencyMs: 5,
            checkedAt: new Date().toISOString(),
            degraded: false,
            requestId: 'mock-health-id',
          }),
        ),
        getReadiness: jest.fn(() => ({
          status: 'up',
          detail: 'mock-ready',
          degraded: false,
        })),
      },
    });
  });

  beforeEach(async () => {
    aiResponseText = JSON.stringify({
      priority: 'LOW',
      summary: 'Prioridad baja, continuar observacion y seguimiento.',
    });
    await context.resetState();
  });

  afterAll(async () => {
    await context.close();
  });

  it('analyzes complete general medicine sessions with AI enabled', async () => {
    const patient = await registerPatientAndLogin(context);
    const created = await createTriageSession(
      context,
      patient.session.accessToken,
      'GENERAL_MEDICINE',
    );

    await saveTriageAnswers(
      context,
      patient.session.accessToken,
      created.sessionId,
      buildGeneralMedicineAnswers(),
    );

    const response = await context
      .request()
      .post(`/v1/triage/sessions/${created.sessionId}/analyze`)
      .set('Authorization', `Bearer ${patient.session.accessToken}`)
      .expect(200);

    const body = response.body as AnalyzeTriageSessionResponseBody;
    expect(['LOW', 'MODERATE', 'HIGH']).toContain(body.priority);
    expect(Array.isArray(body.redFlags)).toBe(true);
  });

  it('analyzes odontology sessions with AI enabled', async () => {
    const patient = await registerPatientAndLogin(context);
    const created = await createTriageSession(
      context,
      patient.session.accessToken,
      'ODONTOLOGY',
    );

    await saveTriageAnswers(
      context,
      patient.session.accessToken,
      created.sessionId,
      buildOdontologyAnswers(),
    );

    const response = await context
      .request()
      .post(`/v1/triage/sessions/${created.sessionId}/analyze`)
      .set('Authorization', `Bearer ${patient.session.accessToken}`)
      .expect(200);

    const body = response.body as AnalyzeTriageSessionResponseBody;
    expect(['LOW', 'MODERATE', 'HIGH']).toContain(body.priority);
    expect(Array.isArray(body.redFlags)).toBe(true);
  });

  it('applies guardrails when AI summary contains diagnosis language', async () => {
    const patient = await registerPatientAndLogin(context);
    const created = await createTriageSession(
      context,
      patient.session.accessToken,
      'GENERAL_MEDICINE',
    );

    await saveTriageAnswers(
      context,
      patient.session.accessToken,
      created.sessionId,
      buildGeneralMedicineAnswers(),
    );

    aiResponseText = JSON.stringify({
      priority: 'LOW',
      summary: 'Diagnostico de migraña. Debe tomar paracetamol.',
    });

    await context
      .request()
      .post(`/v1/triage/sessions/${created.sessionId}/analyze`)
      .set('Authorization', `Bearer ${patient.session.accessToken}`)
      .expect(200);

    const triageSessionModel = context.getModel(TriageSession.name);
    const triageSession = (await triageSessionModel
      .findById(created.sessionId)
      .lean()
      .exec()) as {
      analysis?: {
        guardrailApplied?: boolean;
        aiSummary?: string;
      };
    } | null;

    expect(triageSession?.analysis?.guardrailApplied).toBe(true);
    expect(triageSession?.analysis?.aiSummary).toBeUndefined();
  });

  it('elevates priority when red flags are triggered', async () => {
    const patient = await registerPatientAndLogin(context);
    const created = await createTriageSession(
      context,
      patient.session.accessToken,
      'GENERAL_MEDICINE',
    );

    await saveTriageAnswers(
      context,
      patient.session.accessToken,
      created.sessionId,
      buildHighPriorityGeneralMedicineAnswers(),
    );

    aiResponseText = JSON.stringify({
      priority: 'LOW',
      summary: 'Prioridad baja segun evaluacion inicial.',
    });

    const response = await context
      .request()
      .post(`/v1/triage/sessions/${created.sessionId}/analyze`)
      .set('Authorization', `Bearer ${patient.session.accessToken}`)
      .expect(200);

    const body = response.body as AnalyzeTriageSessionResponseBody;
    expect(body.priority).toBe('HIGH');
    expect(body.redFlags.some((flag) => flag.code === 'RF-MG-001')).toBe(true);
  });
});
