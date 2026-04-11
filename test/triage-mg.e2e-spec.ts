import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { getModelToken } from '@nestjs/mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import {
  Consultation,
  ConsultationDocument,
} from '../src/consultations/schemas/consultation.schema';
import {
  Patient,
  PatientDocument,
} from '../src/patients/schemas/patient.schema';
import {
  TriageSession,
  TriageSessionDocument,
} from '../src/triage/schemas/triage-session.schema';
import { AiService } from '../src/ai/ai.service';

jest.mock('dotenv/config', () => ({}));

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
}

function buildStrongPassword(): string {
  return `Aa1!${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

describe('HU-003 Triage MG (e2e)', () => {
  const originalEnv = {
    NODE_ENV: process.env.NODE_ENV,
    MONGODB_URI: process.env.MONGODB_URI,
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN,
    JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN,
    ENABLE_BOOTSTRAP_ADMIN: process.env.ENABLE_BOOTSTRAP_ADMIN,
    AI_ENABLED: process.env.AI_ENABLED,
    AI_PROVIDER: process.env.AI_PROVIDER,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
    REDIS_URL: process.env.REDIS_URL,
    REDIS_KEY_PREFIX: process.env.REDIS_KEY_PREFIX,
    OUTBOX_DISPATCH_INTERVAL_MS: process.env.OUTBOX_DISPATCH_INTERVAL_MS,
    DOTENV_CONFIG_PATH: process.env.DOTENV_CONFIG_PATH,
  };

  let app: INestApplication<App>;
  let mongoServer: MongoMemoryReplSet;
  let patientModel: Model<PatientDocument>;
  let triageSessionModel: Model<TriageSessionDocument>;
  let consultationModel: Model<ConsultationDocument>;

  let aiResponseText = JSON.stringify({
    priority: 'LOW',
    summary: 'Prioridad baja, continuar observacion y seguimiento.',
  });

  const aiServiceMock = {
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
        status: 'up' as const,
        latencyMs: 5,
        checkedAt: new Date().toISOString(),
        degraded: false,
        requestId: 'mock-health-id',
      }),
    ),
    getReadiness: jest.fn(() => ({
      status: 'up' as const,
      detail: 'mock-ready',
      degraded: false,
    })),
  };

  type AuthSessionResponseBody = {
    accessToken: string;
  };

  type CreateTriageSessionResponseBody = {
    sessionId: string;
  };

  type SaveTriageAnswersResponseBody = {
    isComplete: boolean;
  };

  type AnalyzeTriageSessionResponseBody = {
    priority: string;
    redFlags: Array<{ code: string }>;
  };

  type ActiveTriageSessionsResponseBody = {
    items: Array<{
      id: string;
      specialty: string;
      status: string;
      currentStep: number;
      totalSteps: number;
      currentQuestionId: string | null;
      isComplete: boolean;
      createdAt: string;
      updatedAt: string;
    }>;
    total: number;
  };

  type TriageSessionDetailResponseBody = {
    id: string;
    sessionId: string;
    specialty: string;
    status: string;
    isComplete: boolean;
    currentQuestionId: string | null;
    currentStep: number;
    totalSteps: number;
    totalQuestions: number;
    nextQuestionId: string | null;
    questions: Array<{
      id: string;
      questionId: string;
      title: string;
      questionText: string;
      description?: string;
      type: 'SINGLE_CHOICE' | 'MULTI_CHOICE' | 'NUMERIC_SCALE';
      options?: Array<{
        id: string;
        label: string;
        description?: string;
      }>;
      minValue?: number;
      maxValue?: number;
      step?: number;
    }>;
    createdAt: string;
    updatedAt: string;
  };

  type CancelTriageSessionResponseBody = {
    sessionId: string;
    specialty: string;
    status: string;
    canceledAt: string;
    message: string;
  };

  type HttpErrorResponseBody = {
    statusCode: number;
    message: string | string[];
    existingSessionId?: string;
    errorCode?: string;
  };

  async function registerPatientAndLogin(): Promise<string> {
    const email = uniqueEmail('triage-mg');
    const password = buildStrongPassword();

    await request(app.getHttpServer()).post('/v1/auth/patient/register').send({
      firstName: 'Paciente',
      lastName: 'MG',
      email,
      password,
    });

    const loginResponse = await request(app.getHttpServer())
      .post('/v1/auth/patient/login')
      .send({ email, password })
      .expect(200);

    const body = loginResponse.body as AuthSessionResponseBody;
    return body.accessToken;
  }

  async function createMgSession(token: string): Promise<string> {
    return createSession(token, 'GENERAL_MEDICINE');
  }

  async function createSession(
    token: string,
    specialty: 'GENERAL_MEDICINE' | 'ODONTOLOGY',
  ): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/v1/triage/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ specialty })
      .expect(201);

    const body = response.body as CreateTriageSessionResponseBody;
    return body.sessionId;
  }

  async function completeMgAnswers(
    token: string,
    sessionId: string,
  ): Promise<void> {
    await request(app.getHttpServer())
      .post(`/v1/triage/sessions/${sessionId}/answers`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        answers: [
          { questionId: 'MG-Q1', answerValue: 'cefalea' },
          { questionId: 'MG-Q2', answerValue: '2 dias' },
          { questionId: 'MG-Q3', answerValue: 4 },
          { questionId: 'MG-Q4', answerValue: 'no' },
          { questionId: 'MG-Q5', answerValue: 'no' },
        ],
      })
      .expect(200);
  }

  async function completeOdAnswers(
    token: string,
    sessionId: string,
  ): Promise<void> {
    await request(app.getHttpServer())
      .post(`/v1/triage/sessions/${sessionId}/answers`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        answers: [
          { questionId: 'OD-Q1', answerValue: 'parte superior' },
          { questionId: 'OD-Q2', answerValue: '1 dia' },
          { questionId: 'OD-Q3', answerValue: 6 },
          { questionId: 'OD-Q4', answerValue: 'no' },
          { questionId: 'OD-Q5', answerValue: 'si' },
        ],
      })
      .expect(200);
  }

  beforeAll(async () => {
    jest.spyOn(ThrottlerGuard.prototype, 'canActivate').mockResolvedValue(true);
    mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });

    process.env.NODE_ENV = 'test';
    process.env.DOTENV_CONFIG_PATH = 'test/.env.does-not-exist';
    process.env.MONGODB_URI = mongoServer.getUri();
    process.env.JWT_SECRET = `test-secret-${Date.now()}-${Math.random().toString(36).slice(2, 16)}`;
    process.env.JWT_ACCESS_EXPIRES_IN = '1h';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    process.env.ENABLE_BOOTSTRAP_ADMIN = 'false';
    process.env.AI_ENABLED = 'true';
    process.env.AI_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'mock-key';
    process.env.GEMINI_MODEL = 'mock-model';
    process.env.REDIS_URL = '';
    process.env.REDIS_KEY_PREFIX = 'salud-de-una-triage-mg-e2e';
    process.env.OUTBOX_DISPATCH_INTERVAL_MS = '50';

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('../src/app.module') as {
      AppModule: typeof import('../src/app.module').AppModule;
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: jest.fn().mockResolvedValue(true) })
      .overrideProvider(AiService)
      .useValue(aiServiceMock)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    patientModel = app.get<Model<PatientDocument>>(getModelToken(Patient.name));
    triageSessionModel = app.get<Model<TriageSessionDocument>>(
      getModelToken(TriageSession.name),
    );
    consultationModel = app.get<Model<ConsultationDocument>>(
      getModelToken(Consultation.name),
    );
  });

  beforeEach(async () => {
    aiResponseText = JSON.stringify({
      priority: 'LOW',
      summary: 'Prioridad baja, continuar observacion y seguimiento.',
    });

    await Promise.all([
      patientModel.deleteMany({}),
      triageSessionModel.deleteMany({}),
      consultationModel.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }

    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        Reflect.deleteProperty(process.env, key);
      } else {
        process.env[key] = value;
      }
    }

    jest.restoreAllMocks();
  });

  it('POST /v1/triage/sessions returns 201 with session id for GENERAL_MEDICINE', async () => {
    const token = await registerPatientAndLogin();

    const response = await request(app.getHttpServer())
      .post('/v1/triage/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ specialty: 'GENERAL_MEDICINE' })
      .expect(201);

    const body = response.body as CreateTriageSessionResponseBody;
    expect(body.sessionId).toBeDefined();
  });

  it('POST /v1/triage/sessions returns 409 when an IN_PROGRESS session already exists', async () => {
    const token = await registerPatientAndLogin();

    const existingSessionId = await createMgSession(token);

    const response = await request(app.getHttpServer())
      .post('/v1/triage/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ specialty: 'GENERAL_MEDICINE' })
      .expect(409);

    const body = response.body as HttpErrorResponseBody;
    expect(body.errorCode).toBe('TRIAGE_SESSION_IN_PROGRESS');
    expect(body.existingSessionId).toBe(existingSessionId);
  });

  it('GET /v1/triage/sessions/active returns active session progress and supports specialty filter', async () => {
    const token = await registerPatientAndLogin();
    const sessionId = await createMgSession(token);

    await request(app.getHttpServer())
      .post(`/v1/triage/sessions/${sessionId}/answers`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: [{ questionId: 'MG-Q1', answerValue: 'cefalea' }] })
      .expect(200);

    const response = await request(app.getHttpServer())
      .get('/v1/triage/sessions/active?specialty=GENERAL_MEDICINE')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const body = response.body as ActiveTriageSessionsResponseBody;
    expect(body.total).toBe(1);
    expect(body.items[0]).toMatchObject({
      id: sessionId,
      specialty: 'GENERAL_MEDICINE',
      status: 'IN_PROGRESS',
      totalSteps: 5,
      currentQuestionId: 'MG-Q2',
      isComplete: false,
    });
  });

  it('GET /v1/triage/sessions/:id returns 200 for owner with full questionnaire metadata', async () => {
    const token = await registerPatientAndLogin();
    const sessionId = await createMgSession(token);

    await request(app.getHttpServer())
      .post(`/v1/triage/sessions/${sessionId}/answers`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: [{ questionId: 'MG-Q1', answerValue: 'cefalea' }] })
      .expect(200);

    const response = await request(app.getHttpServer())
      .get(`/v1/triage/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const body = response.body as TriageSessionDetailResponseBody;
    expect(body.id).toBe(sessionId);
    expect(body.sessionId).toBe(sessionId);
    expect(body.specialty).toBe('GENERAL_MEDICINE');
    expect(body.status).toBe('IN_PROGRESS');
    expect(body.isComplete).toBe(false);
    expect(body.currentStep).toBe(2);
    expect(body.totalSteps).toBe(5);
    expect(body.totalQuestions).toBe(5);
    expect(body.currentQuestionId).toBe('MG-Q2');
    expect(body.nextQuestionId).toBe('MG-Q2');
    expect(Array.isArray(body.questions)).toBe(true);
    expect(body.questions.length).toBeGreaterThan(0);

    const numericScaleQuestion = body.questions.find(
      (question) => question.type === 'NUMERIC_SCALE',
    );
    expect(numericScaleQuestion).toBeDefined();
    expect(numericScaleQuestion?.minValue).toBe(0);
    expect(numericScaleQuestion?.maxValue).toBe(10);
    expect(numericScaleQuestion?.step).toBe(1);

    const choiceQuestion = body.questions.find(
      (question) => question.type === 'SINGLE_CHOICE',
    );
    expect(choiceQuestion).toBeDefined();
    expect(Array.isArray(choiceQuestion?.options)).toBe(true);
    expect(choiceQuestion?.options?.[0]).toMatchObject({
      id: expect.any(String),
      label: expect.any(String),
    });
  });

  it('GET /v1/triage/sessions/:id returns 404 for a different patient', async () => {
    const ownerToken = await registerPatientAndLogin();
    const outsiderToken = await registerPatientAndLogin();
    const sessionId = await createMgSession(ownerToken);

    await request(app.getHttpServer())
      .get(`/v1/triage/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(404);
  });

  it('GET /v1/triage/sessions/:id returns 404 when session does not exist', async () => {
    const token = await registerPatientAndLogin();

    await request(app.getHttpServer())
      .get(`/v1/triage/sessions/${new Types.ObjectId().toString()}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('PATCH /v1/triage/sessions/:id/cancel cancels active session and removes it from active list', async () => {
    const token = await registerPatientAndLogin();
    const sessionId = await createMgSession(token);

    const cancelResponse = await request(app.getHttpServer())
      .patch(`/v1/triage/sessions/${sessionId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const cancelBody = cancelResponse.body as CancelTriageSessionResponseBody;
    expect(cancelBody).toMatchObject({
      sessionId,
      specialty: 'GENERAL_MEDICINE',
      status: 'CANCELED',
      message: 'Sesion de triage cancelada correctamente',
    });
    expect(typeof cancelBody.canceledAt).toBe('string');

    const activeResponse = await request(app.getHttpServer())
      .get('/v1/triage/sessions/active?specialty=GENERAL_MEDICINE')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const activeBody = activeResponse.body as ActiveTriageSessionsResponseBody;
    expect(activeBody.total).toBe(0);
    expect(activeBody.items).toEqual([]);
  });

  it('POST /v1/triage/sessions returns 400 for invalid specialty enum', async () => {
    const token = await registerPatientAndLogin();

    const response = await request(app.getHttpServer())
      .post('/v1/triage/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ specialty: 'DENTISTRY' })
      .expect(400);

    const body = response.body as HttpErrorResponseBody;
    expect(Array.isArray(body.message)).toBe(true);
    expect(body.message).toContain(
      'specialty must be one of the following values: GENERAL_MEDICINE, ODONTOLOGY',
    );
  });

  it('POST /v1/triage/sessions/:id/answers returns 200 with isComplete for valid payload', async () => {
    const token = await registerPatientAndLogin();
    const sessionId = await createMgSession(token);

    const response = await request(app.getHttpServer())
      .post(`/v1/triage/sessions/${sessionId}/answers`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        answers: [
          { questionId: 'MG-Q1', answerValue: 'dolor de garganta' },
          { questionId: 'MG-Q2', answerValue: '1 dia' },
          { questionId: 'MG-Q3', answerValue: 3 },
          { questionId: 'MG-Q4', answerValue: 'no' },
          { questionId: 'MG-Q5', answerValue: 'no' },
        ],
      })
      .expect(200);

    const body = response.body as SaveTriageAnswersResponseBody;
    expect(body.isComplete).toBe(true);
  });

  it('POST /v1/triage/sessions/:id/answers returns 404 for non-existing session', async () => {
    const token = await registerPatientAndLogin();

    await request(app.getHttpServer())
      .post(`/v1/triage/sessions/${new Types.ObjectId().toString()}/answers`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: [{ questionId: 'MG-Q1', answerValue: 'dolor' }] })
      .expect(404);
  });

  it('POST /v1/triage/sessions/:id/analyze returns 200 with priority and redFlags for complete session', async () => {
    const token = await registerPatientAndLogin();
    const sessionId = await createMgSession(token);
    await completeMgAnswers(token, sessionId);

    const analyzeResponse = await request(app.getHttpServer())
      .post(`/v1/triage/sessions/${sessionId}/analyze`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const body = analyzeResponse.body as AnalyzeTriageSessionResponseBody;
    expect(['LOW', 'MODERATE', 'HIGH']).toContain(body.priority);
    expect(Array.isArray(body.redFlags)).toBe(true);
  });

  it('POST /v1/triage/sessions/:id/analyze returns 200 for ODONTOLOGY sessions', async () => {
    const token = await registerPatientAndLogin();
    const sessionId = await createSession(token, 'ODONTOLOGY');
    await completeOdAnswers(token, sessionId);

    const analyzeResponse = await request(app.getHttpServer())
      .post(`/v1/triage/sessions/${sessionId}/analyze`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const body = analyzeResponse.body as AnalyzeTriageSessionResponseBody;
    expect(['LOW', 'MODERATE', 'HIGH']).toContain(body.priority);
    expect(Array.isArray(body.redFlags)).toBe(true);
  });

  it('POST /v1/triage/sessions/:id/analyze activates guardrail when Gemini mock returns diagnosis language', async () => {
    const token = await registerPatientAndLogin();
    const sessionId = await createMgSession(token);
    await completeMgAnswers(token, sessionId);

    aiResponseText = JSON.stringify({
      priority: 'LOW',
      summary: 'Diagnostico de migraña. Debe tomar paracetamol.',
    });

    await request(app.getHttpServer())
      .post(`/v1/triage/sessions/${sessionId}/analyze`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const triageSession = await triageSessionModel
      .findById(sessionId)
      .lean()
      .exec();
    expect(triageSession?.analysis?.guardrailApplied).toBe(true);
    expect(triageSession?.analysis?.aiSummary).toBeUndefined();
  });

  it('POST /v1/triage/sessions/:id/analyze sets HIGH priority when RF-MG-001 is triggered', async () => {
    const token = await registerPatientAndLogin();
    const sessionId = await createMgSession(token);

    await request(app.getHttpServer())
      .post(`/v1/triage/sessions/${sessionId}/answers`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        answers: [
          {
            questionId: 'MG-Q1',
            answerValue: 'dolor toracico con falta de aire desde hoy',
          },
          { questionId: 'MG-Q2', answerValue: '1 dia' },
          { questionId: 'MG-Q3', answerValue: 7 },
          { questionId: 'MG-Q4', answerValue: 'no' },
          { questionId: 'MG-Q5', answerValue: 'dificultad para respirar' },
        ],
      })
      .expect(200);

    aiResponseText = JSON.stringify({
      priority: 'LOW',
      summary: 'Prioridad baja segun evaluacion inicial.',
    });

    const analyzeResponse = await request(app.getHttpServer())
      .post(`/v1/triage/sessions/${sessionId}/analyze`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const body = analyzeResponse.body as AnalyzeTriageSessionResponseBody;
    expect(body.priority).toBe('HIGH');
    expect(body.redFlags.some((flag) => flag.code === 'RF-MG-001')).toBe(true);
  });

  it('POST /v1/triage/sessions/:id/analyze returns 422 when session is incomplete', async () => {
    const token = await registerPatientAndLogin();
    const sessionId = await createMgSession(token);

    await request(app.getHttpServer())
      .post(`/v1/triage/sessions/${sessionId}/answers`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: [{ questionId: 'MG-Q1', answerValue: 'cefalea' }] })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/v1/triage/sessions/${sessionId}/analyze`)
      .set('Authorization', `Bearer ${token}`)
      .expect(422);
  });
});
