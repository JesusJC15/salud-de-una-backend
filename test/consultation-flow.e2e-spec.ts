import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { getModelToken } from '@nestjs/mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { io as ioClient, Socket } from 'socket.io-client';
import * as bcrypt from 'bcrypt';
import { Model, Types } from 'mongoose';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { Admin, AdminDocument } from '../src/admins/schemas/admin.schema';
import {
  Consultation,
  ConsultationDocument,
} from '../src/consultations/schemas/consultation.schema';
import {
  ConsultationMessage,
  ConsultationMessageDocument,
} from '../src/chat/schemas/consultation-message.schema';
import { AiService } from '../src/ai/ai.service';
import { RethusState } from '../src/common/enums/rethus-state.enum';

jest.mock('dotenv/config', () => ({}));
jest.setTimeout(120_000);

// ─── helpers ───────────────────────────────────────────────────────────────

function waitForEvent<T>(
  socket: Socket,
  event: string,
  timeoutMs = 4_000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout waiting for "${event}"`)),
      timeoutMs,
    );
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function waitForConnect(socket: Socket, timeoutMs = 4_000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket.connected) {
      resolve();
      return;
    }
    const timer = setTimeout(
      () => reject(new Error('Socket connection timeout')),
      timeoutMs,
    );
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once('connect_error', (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// ─── AI mock ───────────────────────────────────────────────────────────────

const aiServiceMock = {
  generateText: jest.fn(({ promptKey }: { promptKey: string }) => {
    if (promptKey === 'CLINICAL_SUMMARY_V1') {
      return Promise.resolve({
        provider: 'mock',
        model: 'mock',
        text: 'Paciente con cefalea leve de 2 días de evolución. Sin signos de alarma.',
        latencyMs: 1,
        requestId: 'mock-summary',
      });
    }
    return Promise.resolve({
      provider: 'mock',
      model: 'mock',
      text: JSON.stringify({
        priority: 'LOW',
        summary: 'Caso leve. Sin urgencia.',
      }),
      latencyMs: 1,
      requestId: 'mock-triage',
    });
  }),
  healthCheck: jest.fn(() =>
    Promise.resolve({
      provider: 'mock',
      model: 'mock',
      status: 'up' as const,
      latencyMs: 1,
      checkedAt: new Date().toISOString(),
      degraded: false,
      requestId: 'mock-health',
    }),
  ),
  getReadiness: jest.fn(() => ({
    status: 'up' as const,
    detail: 'mock',
    degraded: false,
  })),
};

// ─── suite ─────────────────────────────────────────────────────────────────

describe('Happy path: triage → consulta → chat → cierre → calificación (e2e)', () => {
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
    AUTH0_DOMAIN: process.env.AUTH0_DOMAIN,
    AUTH0_AUDIENCE: process.env.AUTH0_AUDIENCE,
  };

  let app: INestApplication<App>;
  let mongoServer: MongoMemoryReplSet;
  let serverPort: number;

  // Shared models for direct DB checks
  let consultationModel: Model<ConsultationDocument>;
  let messageModel: Model<ConsultationMessageDocument>;

  // Shared state built incrementally across ordered tests
  let patientToken: string;
  let patientId: string;
  let doctorToken: string;
  let doctorId: string;
  let consultationId: string;

  const adminEmail = 'admin-flow@example.com';
  const adminPassword = 'AdminFlow@1';
  const patientEmail = 'patient-flow@example.com';
  const patientPassword = 'PatientFlow@1';
  const doctorEmail = 'doctor-flow@example.com';
  const doctorPassword = 'DoctorFlow@1';

  // ── bootstrap ─────────────────────────────────────────────────────────

  beforeAll(async () => {
    jest.spyOn(ThrottlerGuard.prototype, 'canActivate').mockResolvedValue(true);

    mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });

    process.env.NODE_ENV = 'test';
    process.env.DOTENV_CONFIG_PATH = 'test/.env.does-not-exist';
    process.env.MONGODB_URI = mongoServer.getUri();
    process.env.JWT_SECRET =
      'flow-test-secret-12345678901234567890123456789012';
    process.env.JWT_ACCESS_EXPIRES_IN = '1h';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    process.env.ENABLE_BOOTSTRAP_ADMIN = 'false';
    process.env.AI_ENABLED = 'true';
    process.env.AI_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'mock-key';
    process.env.GEMINI_MODEL = 'mock-model';
    process.env.REDIS_URL = '';
    process.env.REDIS_KEY_PREFIX = 'salud-de-una-flow-e2e';
    process.env.OUTBOX_DISPATCH_INTERVAL_MS = '50';
    process.env.AUTH0_DOMAIN = 'test.auth0.com';
    process.env.AUTH0_AUDIENCE = 'https://test-api.salud-de-una.com/';

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

    // listen(0) assigns a random port — needed for WebSocket client connections
    await app.listen(0);
    const httpServer = app.getHttpServer() as {
      address: () => { port: number } | null;
    };
    serverPort = httpServer.address()?.port ?? 0;

    consultationModel = app.get<Model<ConsultationDocument>>(
      getModelToken(Consultation.name),
    );
    messageModel = app.get<Model<ConsultationMessageDocument>>(
      getModelToken(ConsultationMessage.name),
    );

    // Seed admin
    const adminModel = app.get<Model<AdminDocument>>(getModelToken(Admin.name));
    const adminPasswordHash = await bcrypt.hash(adminPassword, 12);
    await adminModel.create({
      firstName: 'Admin',
      lastName: 'Flow',
      email: adminEmail,
      passwordHash: adminPasswordHash,
    });

    // Register + login patient
    const patientRegRes = await request(app.getHttpServer())
      .post('/v1/auth/patient/register')
      .send({
        firstName: 'Carmen',
        lastName: 'Rios',
        email: patientEmail,
        password: patientPassword,
      })
      .expect(201);
    patientId = (patientRegRes.body as { id: string }).id;

    const patientLoginRes = await request(app.getHttpServer())
      .post('/v1/auth/patient/login')
      .send({ email: patientEmail, password: patientPassword })
      .expect(200);
    patientToken = (patientLoginRes.body as { accessToken: string })
      .accessToken;

    // Register doctor + get id
    const doctorRegRes = await request(app.getHttpServer())
      .post('/v1/auth/doctor/register')
      .send({
        firstName: 'Felipe',
        lastName: 'Torres',
        email: doctorEmail,
        password: doctorPassword,
        specialty: 'GENERAL_MEDICINE',
        personalId: `CC-FLOW-${Date.now()}`,
        phoneNumber: '3001234567',
      })
      .expect(201);
    doctorId = (doctorRegRes.body as { id: string }).id;

    // Admin verifies doctor
    const adminLoginRes = await request(app.getHttpServer())
      .post('/v1/auth/staff/login')
      .send({ email: adminEmail, password: adminPassword })
      .expect(200);
    const adminToken = (adminLoginRes.body as { accessToken: string })
      .accessToken;

    await request(app.getHttpServer())
      .post(`/v1/admin/doctors/${doctorId}/doctor-verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        programType: 'UNIVERSITY',
        titleObtainingOrigin: 'LOCAL',
        professionOccupation: 'MEDICO GENERAL',
        startDate: '2024-01-15',
        rethusState: RethusState.VALID,
        administrativeAct: 'ACT-FLOW-001',
        reportingEntity: 'MINISTERIO DE SALUD',
        notes: 'Verificado para flow e2e',
      })
      .expect(201);

    // Doctor login (now verified)
    const doctorLoginRes = await request(app.getHttpServer())
      .post('/v1/auth/staff/login')
      .send({ email: doctorEmail, password: doctorPassword })
      .expect(200);
    doctorToken = (doctorLoginRes.body as { accessToken: string }).accessToken;

    // Patient creates triage session
    const sessionRes = await request(app.getHttpServer())
      .post('/v1/triage/sessions')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ specialty: 'GENERAL_MEDICINE' })
      .expect(201);
    const sessionId = (sessionRes.body as { sessionId: string }).sessionId;

    // Patient answers all MG questions
    await request(app.getHttpServer())
      .post(`/v1/triage/sessions/${sessionId}/answers`)
      .set('Authorization', `Bearer ${patientToken}`)
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

    // Patient analyzes → creates consultation PENDING
    await request(app.getHttpServer())
      .post(`/v1/triage/sessions/${sessionId}/analyze`)
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);

    // Retrieve consultation id from DB
    const consultation = await consultationModel
      .findOne({ patientId: new Types.ObjectId(patientId) })
      .lean()
      .exec();
    consultationId = consultation!._id.toString();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (mongoServer) await mongoServer.stop();
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        Reflect.deleteProperty(process.env, key);
      } else {
        process.env[key] = value;
      }
    }
    jest.restoreAllMocks();
  });

  // ── tests (sequential — each step builds on the previous) ─────────────

  it('cola muestra la consulta PENDING', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/consultations/queue')
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);

    const body = res.body as { items: Array<{ id: string; status: string }> };
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    const found = body.items.find((i) => i.id === consultationId);
    expect(found).toBeDefined();
    expect(found?.status).toBe('PENDING');
  });

  it('doctor asigna consulta → estado IN_ATTENTION', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/consultations/${consultationId}/assign`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);

    const body = res.body as {
      id: string;
      status: string;
      assignedDoctorId: string;
    };
    expect(body.status).toBe('IN_ATTENTION');
    expect(body.assignedDoctorId).toBe(doctorId);

    // Verify in DB
    const doc = await consultationModel.findById(consultationId).lean().exec();
    expect(doc?.status).toBe('IN_ATTENTION');
    expect(doc?.assignedDoctorId?.toString()).toBe(doctorId);
  });

  it('WebSocket: paciente y médico intercambian mensajes en la sala', async () => {
    const base = `http://localhost:${serverPort}`;

    const patientSocket = ioClient(`${base}/chat`, {
      auth: { token: patientToken },
      transports: ['websocket'],
      forceNew: true,
    });

    const doctorSocket = ioClient(`${base}/chat`, {
      auth: { token: doctorToken },
      transports: ['websocket'],
      forceNew: true,
    });

    try {
      await Promise.all([
        waitForConnect(patientSocket),
        waitForConnect(doctorSocket),
      ]);

      // Both join the consultation room
      patientSocket.emit('chat:join', { consultationId });
      doctorSocket.emit('chat:join', { consultationId });

      // Wait for both history responses (empty at this point)
      const [patientHistory, doctorHistory] = await Promise.all([
        waitForEvent<{ messages: unknown[] }>(patientSocket, 'chat:history'),
        waitForEvent<{ messages: unknown[] }>(doctorSocket, 'chat:history'),
      ]);
      expect(Array.isArray(patientHistory.messages)).toBe(true);
      expect(Array.isArray(doctorHistory.messages)).toBe(true);

      // Doctor sends a message — both patient and doctor should receive it
      const patientReceive = waitForEvent<{
        content: string;
        senderRole: string;
      }>(patientSocket, 'chat:message');
      const doctorReceive = waitForEvent<{
        content: string;
        senderRole: string;
      }>(doctorSocket, 'chat:message');
      doctorSocket.emit('chat:send', {
        consultationId,
        content: 'Buenos días, ¿cómo se siente hoy?',
      });

      const [msgAtPatient, msgAtDoctor] = await Promise.all([
        patientReceive,
        doctorReceive,
      ]);
      expect(msgAtPatient.content).toBe('Buenos días, ¿cómo se siente hoy?');
      expect(msgAtPatient.senderRole).toBe('DOCTOR');
      expect(msgAtDoctor.content).toBe('Buenos días, ¿cómo se siente hoy?');

      // Patient replies
      const doctorReceive2 = waitForEvent<{
        content: string;
        senderRole: string;
      }>(doctorSocket, 'chat:message');
      patientSocket.emit('chat:send', {
        consultationId,
        content: 'Tengo dolor de cabeza desde ayer.',
      });

      const reply = await doctorReceive2;
      expect(reply.content).toBe('Tengo dolor de cabeza desde ayer.');
      expect(reply.senderRole).toBe('PATIENT');

      // Verify messages persisted in DB
      const savedMessages = await messageModel
        .find({ consultationId: new Types.ObjectId(consultationId) })
        .lean()
        .exec();
      expect(savedMessages).toHaveLength(2);
    } finally {
      patientSocket.disconnect();
      doctorSocket.disconnect();
    }
  });

  it('GET /v1/consultations/:id/messages devuelve historial de chat', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/consultations/${consultationId}/messages`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);

    const body = res.body as {
      items: Array<{ content: string; senderRole: string }>;
      total: number;
    };
    expect(body.total).toBe(2);
    expect(body.items[0].senderRole).toBe('DOCTOR');
    expect(body.items[1].senderRole).toBe('PATIENT');
  });

  it('doctor genera resumen clínico via IA', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/consultations/${consultationId}/summary/generate`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(201);

    const body = res.body as {
      consultationId: string;
      summary: string;
      generatedAt: string;
    };
    expect(body.consultationId).toBe(consultationId);
    expect(typeof body.summary).toBe('string');
    expect(body.summary.length).toBeGreaterThan(10);

    // AI mock was called
    expect(aiServiceMock.generateText).toHaveBeenCalled();

    // Persisted in DB
    const doc = await consultationModel.findById(consultationId).lean().exec();
    expect(doc?.clinicalSummary).toBeTruthy();
  });

  it('doctor cierra consulta → estado CLOSED', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/consultations/${consultationId}/close`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);

    const body = res.body as { id: string; status: string; closedAt: string };
    expect(body.status).toBe('CLOSED');
    expect(body.closedAt).toBeTruthy();

    const doc = await consultationModel.findById(consultationId).lean().exec();
    expect(doc?.status).toBe('CLOSED');
    expect(doc?.closedAt).toBeDefined();
  });

  it('WebSocket: paciente puede unirse a consulta CLOSED para ver historial (solo lectura)', async () => {
    const patientSocket = ioClient(`http://localhost:${serverPort}/chat`, {
      auth: { token: patientToken },
      transports: ['websocket'],
      forceNew: true,
    });

    try {
      await waitForConnect(patientSocket);
      patientSocket.emit('chat:join', { consultationId });

      const history = await waitForEvent<{ messages: unknown[] }>(
        patientSocket,
        'chat:history',
      );
      // Can read history of closed consultation
      expect(Array.isArray(history.messages)).toBe(true);
      expect(history.messages.length).toBe(2);

      // Cannot send messages — should receive a FORBIDDEN error
      const errorReceived = waitForEvent<{ code: string }>(
        patientSocket,
        'chat:error',
      );
      patientSocket.emit('chat:send', {
        consultationId,
        content: 'Intento enviar en consulta cerrada',
      });

      const err = await errorReceived;
      expect(err.code).toBe('FORBIDDEN');
    } finally {
      patientSocket.disconnect();
    }
  });

  it('paciente califica consulta con 4 estrellas', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/consultations/${consultationId}/rate`)
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ rating: 4, ratingComment: 'Muy buena atención.' })
      .expect(201);

    const body = res.body as {
      id: string;
      rating: number;
      ratingComment: string;
    };
    expect(body.rating).toBe(4);
    expect(body.ratingComment).toBe('Muy buena atención.');

    // No se puede calificar dos veces
    await request(app.getHttpServer())
      .post(`/v1/consultations/${consultationId}/rate`)
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ rating: 5 })
      .expect(409);
  });

  it('historial del paciente incluye consulta cerrada con calificación', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/consultations/my-history')
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);

    const body = res.body as {
      items: Array<{ id: string; status: string; rating: number | null }>;
      total: number;
    };
    expect(body.total).toBeGreaterThanOrEqual(1);
    const item = body.items.find((i) => i.id === consultationId);
    expect(item).toBeDefined();
    expect(item?.status).toBe('CLOSED');
    expect(item?.rating).toBe(4);
  });

  it('historial del médico incluye el caso cerrado', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/consultations/doctor/my-history')
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);

    const body = res.body as {
      items: Array<{ id: string; status: string; patientId: string }>;
      total: number;
    };
    expect(body.total).toBeGreaterThanOrEqual(1);
    const item = body.items.find((i) => i.id === consultationId);
    expect(item).toBeDefined();
    expect(item?.status).toBe('CLOSED');
    expect(item?.patientId).toBe(patientId);
  });
});
