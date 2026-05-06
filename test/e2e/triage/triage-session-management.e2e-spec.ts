import { Types } from 'mongoose';
import { TriageSession } from '../../../src/triage/schemas/triage-session.schema';
import {
  buildGeneralMedicineAnswers,
  buildPartialGeneralMedicineAnswers,
} from '../support/builders';
import type {
  ActiveTriageSessionsResponseBody,
  CancelTriageSessionResponseBody,
  HttpErrorResponseBody,
  TriageSessionDetailResponseBody,
} from '../support/contracts';
import { E2eTestContext } from '../support/e2e-harness';
import {
  createTriageSession,
  registerPatientAndLogin,
  saveTriageAnswers,
  seedAdminAndLogin,
} from '../support/flows';

describe('E2E Triage / Session Management', () => {
  let context: E2eTestContext;

  beforeAll(async () => {
    context = await E2eTestContext.create();
  });

  beforeEach(async () => {
    await context.resetState();
  });

  afterAll(async () => {
    if (context) {
      await context.close();
    }
  });

  it('creates a triage session for patient role', async () => {
    const { session } = await registerPatientAndLogin(context, {
      firstName: 'Sofia',
      lastName: 'Mendez',
      email: 'triage-patient@example.com',
      password: 'StrongP@ss1',
    });

    const body = await createTriageSession(
      context,
      session.accessToken,
      'GENERAL_MEDICINE',
    );

    expect(body.sessionId).toBeDefined();
    expect(body.specialty).toBe('GENERAL_MEDICINE');
    expect(body.status).toBe('IN_PROGRESS');
    expect(body.totalQuestions).toBeGreaterThan(0);
    expect(body.answeredCount).toBe(0);
    expect(body.progressPercent).toBe(0);
    expect(body.isComplete).toBe(false);
    expect(Array.isArray(body.questions)).toBe(true);
    expect(body.questions.length).toBeGreaterThan(0);
  });

  it('returns 409 when an active session already exists', async () => {
    const { session } = await registerPatientAndLogin(context, {
      firstName: 'Paula',
      lastName: 'Rios',
      email: 'triage-conflict@example.com',
      password: 'StrongP@ss1',
    });

    const existing = await createTriageSession(
      context,
      session.accessToken,
      'GENERAL_MEDICINE',
    );

    const response = await context
      .request()
      .post('/v1/triage/sessions')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ specialty: 'GENERAL_MEDICINE' })
      .expect(409);

    const body = response.body as HttpErrorResponseBody;
    expect(body.errorCode).toBe('TRIAGE_SESSION_IN_PROGRESS');
    expect(body.existingSessionId).toBe(existing.sessionId);
  });

  it('validates invalid specialty payloads', async () => {
    const { session } = await registerPatientAndLogin(context, {
      firstName: 'Nora',
      lastName: 'Diaz',
      email: 'triage-invalid-specialty@example.com',
      password: 'StrongP@ss1',
    });

    const response = await context
      .request()
      .post('/v1/triage/sessions')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ specialty: 'DENTISTRY' })
      .expect(400);

    const body = response.body as HttpErrorResponseBody;
    expect(Array.isArray(body.message)).toBe(true);
    expect(body.message).toContain(
      'specialty must be one of the following values: GENERAL_MEDICINE, ODONTOLOGY',
    );
  });

  it('requires authentication to create triage sessions', async () => {
    await context
      .request()
      .post('/v1/triage/sessions')
      .send({ specialty: 'GENERAL_MEDICINE' })
      .expect(401);
  });

  it('forbids non-patient actors from creating triage sessions', async () => {
    await context.resetState({ seedDefaultAdmin: true });
    const { session } = await seedAdminAndLogin(context, {
      email: 'admin@example.com',
      password: 'AdminP@ss1',
    });

    await context
      .request()
      .post('/v1/triage/sessions')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ specialty: 'GENERAL_MEDICINE' })
      .expect(403);
  });

  it('lists active sessions with specialty filter and progress', async () => {
    const { session } = await registerPatientAndLogin(context);
    const created = await createTriageSession(
      context,
      session.accessToken,
      'GENERAL_MEDICINE',
    );

    await saveTriageAnswers(
      context,
      session.accessToken,
      created.sessionId,
      buildPartialGeneralMedicineAnswers(),
    );

    const response = await context
      .request()
      .get('/v1/triage/sessions/active?specialty=GENERAL_MEDICINE')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);

    const body = response.body as ActiveTriageSessionsResponseBody;
    expect(body.total).toBe(1);
    expect(body.items[0]).toMatchObject({
      id: created.sessionId,
      specialty: 'GENERAL_MEDICINE',
      status: 'IN_PROGRESS',
      totalSteps: 5,
      currentQuestionId: 'MG-Q2',
      isComplete: false,
    });
  });

  it('returns session detail with questionnaire metadata for the owner', async () => {
    const { session } = await registerPatientAndLogin(context);
    const created = await createTriageSession(
      context,
      session.accessToken,
      'GENERAL_MEDICINE',
    );

    await saveTriageAnswers(
      context,
      session.accessToken,
      created.sessionId,
      buildPartialGeneralMedicineAnswers(),
    );

    const response = await context
      .request()
      .get(`/v1/triage/sessions/${created.sessionId}`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);

    const body = response.body as TriageSessionDetailResponseBody;
    expect(body.id).toBe(created.sessionId);
    expect(body.sessionId).toBe(created.sessionId);
    expect(body.specialty).toBe('GENERAL_MEDICINE');
    expect(body.status).toBe('IN_PROGRESS');
    expect(body.currentStep).toBe(2);
    expect(body.totalQuestions).toBe(5);
    expect(body.currentQuestionId).toBe('MG-Q2');
    expect(body.nextQuestionId).toBe('MG-Q2');

    const numericQuestion = body.questions.find(
      (question) => question.type === 'NUMERIC_SCALE',
    );
    expect(numericQuestion?.minValue).toBe(0);
    expect(numericQuestion?.maxValue).toBe(10);
    expect(numericQuestion?.step).toBe(1);
  });

  it('returns 404 for triage session detail requested by another patient', async () => {
    const owner = await registerPatientAndLogin(context);
    const outsider = await registerPatientAndLogin(context);
    const created = await createTriageSession(
      context,
      owner.session.accessToken,
      'GENERAL_MEDICINE',
    );

    await context
      .request()
      .get(`/v1/triage/sessions/${created.sessionId}`)
      .set('Authorization', `Bearer ${outsider.session.accessToken}`)
      .expect(404);
  });

  it('returns 404 for missing triage session detail', async () => {
    const { session } = await registerPatientAndLogin(context);

    await context
      .request()
      .get(`/v1/triage/sessions/${new Types.ObjectId().toString()}`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(404);
  });

  it('saves partial answers and tracks remaining progress', async () => {
    const { session } = await registerPatientAndLogin(context, {
      email: 'triage-answers-partial@example.com',
      password: 'StrongP@ss1',
    });
    const created = await createTriageSession(
      context,
      session.accessToken,
      'GENERAL_MEDICINE',
    );

    const body = await saveTriageAnswers(
      context,
      session.accessToken,
      created.sessionId,
      buildPartialGeneralMedicineAnswers(),
    );

    expect(body).toMatchObject({
      sessionId: created.sessionId,
      answersCount: 1,
      isComplete: false,
      totalQuestions: 5,
      answeredCount: 1,
      remainingQuestions: 4,
      progressPercent: 20,
      nextQuestionId: 'MG-Q2',
    });
  });

  it('marks session as complete when all answers are submitted', async () => {
    const { session } = await registerPatientAndLogin(context, {
      email: 'triage-answers-complete@example.com',
      password: 'StrongP@ss1',
    });
    const created = await createTriageSession(
      context,
      session.accessToken,
      'GENERAL_MEDICINE',
    );

    const body = await saveTriageAnswers(
      context,
      session.accessToken,
      created.sessionId,
      buildGeneralMedicineAnswers(),
    );

    expect(body).toMatchObject({
      sessionId: created.sessionId,
      answersCount: 5,
      isComplete: true,
      totalQuestions: 5,
      answeredCount: 5,
      remainingQuestions: 0,
      progressPercent: 100,
      nextQuestionId: null,
    });
  });

  it('returns 404 when saving answers on a session owned by another patient', async () => {
    const owner = await registerPatientAndLogin(context, {
      email: 'triage-owner-a@example.com',
      password: 'StrongP@ss1',
    });
    const outsider = await registerPatientAndLogin(context, {
      email: 'triage-owner-b@example.com',
      password: 'StrongP@ss1',
    });
    const created = await createTriageSession(
      context,
      owner.session.accessToken,
      'GENERAL_MEDICINE',
    );

    await context
      .request()
      .post(`/v1/triage/sessions/${created.sessionId}/answers`)
      .set('Authorization', `Bearer ${outsider.session.accessToken}`)
      .send({ answers: buildPartialGeneralMedicineAnswers() })
      .expect(404);
  });

  it('rejects answer submission for invalid session state', async () => {
    const { session } = await registerPatientAndLogin(context, {
      email: 'triage-invalid-status@example.com',
      password: 'StrongP@ss1',
    });
    const created = await createTriageSession(
      context,
      session.accessToken,
      'GENERAL_MEDICINE',
    );

    const triageSessionModel = context.getModel(TriageSession.name);
    await triageSessionModel
      .updateOne(
        { _id: new Types.ObjectId(created.sessionId) },
        { $set: { status: 'COMPLETED' } },
      )
      .exec();

    await context
      .request()
      .post(`/v1/triage/sessions/${created.sessionId}/answers`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ answers: buildPartialGeneralMedicineAnswers() })
      .expect(400);
  });

  it('rejects invalid triage question identifiers', async () => {
    const { session } = await registerPatientAndLogin(context, {
      email: 'triage-invalid-question@example.com',
      password: 'StrongP@ss1',
    });
    const created = await createTriageSession(
      context,
      session.accessToken,
      'GENERAL_MEDICINE',
    );

    await context
      .request()
      .post(`/v1/triage/sessions/${created.sessionId}/answers`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        answers: [{ questionId: 'INVALID-Q', answerValue: 'x' }],
      })
      .expect(400);
  });

  it('cancels an active session and removes it from active list', async () => {
    const { session } = await registerPatientAndLogin(context);
    const created = await createTriageSession(
      context,
      session.accessToken,
      'GENERAL_MEDICINE',
    );

    const cancelResponse = await context
      .request()
      .patch(`/v1/triage/sessions/${created.sessionId}/cancel`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);

    const cancelBody = cancelResponse.body as CancelTriageSessionResponseBody;
    expect(cancelBody).toMatchObject({
      sessionId: created.sessionId,
      specialty: 'GENERAL_MEDICINE',
      status: 'CANCELED',
      message: 'Sesion de triage cancelada correctamente',
    });

    const activeResponse = await context
      .request()
      .get('/v1/triage/sessions/active?specialty=GENERAL_MEDICINE')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);

    const activeBody = activeResponse.body as ActiveTriageSessionsResponseBody;
    expect(activeBody.total).toBe(0);
    expect(activeBody.items).toEqual([]);
  });
});
