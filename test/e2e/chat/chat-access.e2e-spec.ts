import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { io as ioClient, Socket } from 'socket.io-client';
import * as bcrypt from 'bcrypt';
import { Connection, ConnectionStates, Model, Types } from 'mongoose';
import { HttpExceptionFilter } from '../../../src/common/filters/http-exception.filter';
import { Admin, AdminDocument } from '../../../src/admins/schemas/admin.schema';
import {
  Consultation,
  ConsultationDocument,
} from '../../../src/consultations/schemas/consultation.schema';
import { AiService } from '../../../src/ai/ai.service';
import { RethusState } from '../../../src/common/enums/rethus-state.enum';

jest.mock('dotenv/config', () => ({}));
jest.setTimeout(120_000);

// ─── helpers ─────────────────────────────────────────────────────────────────

function waitForEvent<T>(socket: Socket, event: string, timeoutMs = 5_000): Promise<T> {
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

function waitForConnect(socket: Socket, timeoutMs = 5_000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket.connected) { resolve(); return; }
    const timer = setTimeout(
      () => reject(new Error('Socket connection timeout')),
      timeoutMs,
    );
    socket.once('connect', () => { clearTimeout(timer); resolve(); });
    socket.once('connect_error', (err: Error) => { clearTimeout(timer); reject(err); });
  });
}

function waitForConnectError(socket: Socket, timeoutMs = 5_000): Promise<Error> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Expected connect_error but got none')),
      timeoutMs,
    );
    socket.once('connect_error', (err: Error) => { clearTimeout(timer); resolve(err); });
    socket.once('connect', () => { clearTimeout(timer); reject(new Error('Expected error but connected successfully')); });
  });
}

// ─── AI mock ─────────────────────────────────────────────────────────────────

const aiServiceMock = {
  generateText: jest.fn(() =>
    Promise.resolve({
      provider: 'mock',
      model: 'mock',
      text: JSON.stringify({ priority: 'LOW', summary: 'Caso leve.' }),
      latencyMs: 1,
      requestId: 'mock-triage',
    }),
  ),
  healthCheck: jest.fn(() =>
    Promise.resolve({ provider: 'mock', model: 'mock', status: 'up' as const, latencyMs: 1, checkedAt: new Date().toISOString(), degraded: false, requestId: 'mock' }),
  ),
  getReadiness: jest.fn(() => ({ status: 'up' as const, detail: 'mock', degraded: false })),
};

// ─── suite ───────────────────────────────────────────────────────────────────

describe('Chat access control (e2e)', () => {
  let app: INestApplication<App>;
  let mongoServer: MongoMemoryReplSet;
  let serverPort: number;
  let consultationModel: Model<ConsultationDocument>;

  let patientAToken: string;
  let patientAId: string;
  let patientBToken: string;
  let doctorToken: string;
  let consultationId: string;

  const adminEmail = 'admin-chat@test.com';
  const adminPassword = 'AdminChat@1';
  const patientAEmail = 'patient-a-chat@test.com';
  const patientAPassword = 'PatientA@1';
  const patientBEmail = 'patient-b-chat@test.com';
  const patientBPassword = 'PatientB@1';
  const doctorEmail = 'doctor-chat@test.com';
  const doctorPassword = 'DoctorChat@1';

  // ── bootstrap ──────────────────────────────────────────────────────────────

  beforeAll(async () => {
    jest.spyOn(ThrottlerGuard.prototype, 'canActivate').mockResolvedValue(true);

    mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });

    process.env.NODE_ENV = 'test';
    process.env.DOTENV_CONFIG_PATH = 'test/.env.does-not-exist';
    process.env.MONGODB_URI = mongoServer.getUri();
    process.env.JWT_SECRET = 'chat-access-test-secret-12345678901234567890';
    process.env.JWT_ACCESS_EXPIRES_IN = '1h';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    process.env.ENABLE_BOOTSTRAP_ADMIN = 'false';
    process.env.AI_ENABLED = 'true';
    process.env.AI_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'mock-key';
    process.env.GEMINI_MODEL = 'mock-model';
    process.env.REDIS_URL = '';
    process.env.REDIS_KEY_PREFIX = 'salud-de-una-chat-e2e';
    process.env.OUTBOX_DISPATCH_INTERVAL_MS = '50';
    process.env.AUTH0_DOMAIN = 'test.auth0.com';
    process.env.AUTH0_AUDIENCE = 'https://test-api.salud-de-una.com/';

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('../../../src/app.module') as {
      AppModule: typeof import('../../../src/app.module').AppModule;
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
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true, forbidNonWhitelisted: true, transform: true,
      transformOptions: { enableImplicitConversion: true },
    }));
    app.useGlobalFilters(new HttpExceptionFilter());

    await app.listen(0);
    const httpServer = app.getHttpServer() as { address: () => { port: number } | null };
    serverPort = httpServer.address()?.port ?? 0;

    consultationModel = app.get<Model<ConsultationDocument>>(
      getModelToken(Consultation.name),
    );

    // Seed admin
    const adminModel = app.get<Model<AdminDocument>>(getModelToken(Admin.name));
    await adminModel.create({
      firstName: 'Admin', lastName: 'Chat',
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, 12),
    });

    // Register + login patient A
    const regA = await request(app.getHttpServer())
      .post('/v1/auth/patient/register')
      .send({ firstName: 'Ana', lastName: 'Gomez', email: patientAEmail, password: patientAPassword })
      .expect(201);
    patientAId = (regA.body as { id: string }).id;

    const loginA = await request(app.getHttpServer())
      .post('/v1/auth/patient/login')
      .send({ email: patientAEmail, password: patientAPassword })
      .expect(200);
    patientAToken = (loginA.body as { accessToken: string }).accessToken;

    // Register + login patient B (intruder)
    await request(app.getHttpServer())
      .post('/v1/auth/patient/register')
      .send({ firstName: 'Bob', lastName: 'Intruder', email: patientBEmail, password: patientBPassword })
      .expect(201);

    const loginB = await request(app.getHttpServer())
      .post('/v1/auth/patient/login')
      .send({ email: patientBEmail, password: patientBPassword })
      .expect(200);
    patientBToken = (loginB.body as { accessToken: string }).accessToken;

    // Register doctor
    const regDoc = await request(app.getHttpServer())
      .post('/v1/auth/doctor/register')
      .send({
        firstName: 'Laura', lastName: 'Medina',
        email: doctorEmail, password: doctorPassword,
        specialty: 'GENERAL_MEDICINE',
        personalId: `CC-CHAT-${Date.now()}`,
        phoneNumber: '3001234567',
      })
      .expect(201);
    const doctorId = (regDoc.body as { id: string }).id;

    // Admin verifies doctor
    const adminLogin = await request(app.getHttpServer())
      .post('/v1/auth/staff/login')
      .send({ email: adminEmail, password: adminPassword })
      .expect(200);
    const adminToken = (adminLogin.body as { accessToken: string }).accessToken;

    await request(app.getHttpServer())
      .post(`/v1/admin/doctors/${doctorId}/doctor-verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        programType: 'UNIVERSITY', titleObtainingOrigin: 'LOCAL',
        professionOccupation: 'MEDICO GENERAL', startDate: '2024-01-15',
        rethusState: RethusState.VALID, administrativeAct: 'ACT-CHAT-001',
        reportingEntity: 'MINISTERIO DE SALUD', notes: 'Verificado para chat e2e',
      })
      .expect(201);

    // Doctor login
    const doctorLogin = await request(app.getHttpServer())
      .post('/v1/auth/staff/login')
      .send({ email: doctorEmail, password: doctorPassword })
      .expect(200);
    doctorToken = (doctorLogin.body as { accessToken: string }).accessToken;

    // Patient A creates triage session
    const sessionRes = await request(app.getHttpServer())
      .post('/v1/triage/sessions')
      .set('Authorization', `Bearer ${patientAToken}`)
      .send({ specialty: 'GENERAL_MEDICINE' })
      .expect(201);
    const sessionId = (sessionRes.body as { sessionId: string }).sessionId;

    await request(app.getHttpServer())
      .post(`/v1/triage/sessions/${sessionId}/answers`)
      .set('Authorization', `Bearer ${patientAToken}`)
      .send({ answers: [
        { questionId: 'MG-Q1', answerValue: 'cefalea' },
        { questionId: 'MG-Q2', answerValue: '2 dias' },
        { questionId: 'MG-Q3', answerValue: 4 },
        { questionId: 'MG-Q4', answerValue: 'no' },
        { questionId: 'MG-Q5', answerValue: 'no' },
      ]})
      .expect(200);

    await request(app.getHttpServer())
      .post(`/v1/triage/sessions/${sessionId}/analyze`)
      .set('Authorization', `Bearer ${patientAToken}`)
      .expect(200);

    const consultation = await consultationModel
      .findOne({ patientId: new Types.ObjectId(patientAId) })
      .lean().exec();
    consultationId = consultation!._id.toString();

    // Doctor assigns consultation
    await request(app.getHttpServer())
      .patch(`/v1/consultations/${consultationId}/assign`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);
  });

  afterAll(async () => {
    if (app) await app.close();
    if (mongoServer) await mongoServer.stop({ doCleanup: true, force: true });
    jest.restoreAllMocks();
  });

  // ── tests ──────────────────────────────────────────────────────────────────

  it('paciente propietario puede unirse al chat y recibir historial', async () => {
    const socket = ioClient(`http://localhost:${serverPort}/chat`, {
      auth: { token: patientAToken },
      transports: ['websocket'],
    });
    try {
      await waitForConnect(socket);
      socket.emit('chat:join', { consultationId });
      const history = await waitForEvent<{ messages: unknown[] }>(socket, 'chat:history');
      expect(Array.isArray(history.messages)).toBe(true);
    } finally {
      socket.disconnect();
    }
  });

  it('doctor asignado puede unirse y enviar mensaje', async () => {
    const socket = ioClient(`http://localhost:${serverPort}/chat`, {
      auth: { token: doctorToken },
      transports: ['websocket'],
    });
    try {
      await waitForConnect(socket);
      socket.emit('chat:join', { consultationId });
      await waitForEvent(socket, 'chat:history');

      socket.emit('chat:send', { consultationId, content: 'Hola paciente, ¿cómo se siente?' });
      const msg = await waitForEvent<{ content: string; senderRole: string }>(socket, 'chat:message');
      expect(msg.content).toBe('Hola paciente, ¿cómo se siente?');
      expect(msg.senderRole).toBe('DOCTOR');
    } finally {
      socket.disconnect();
    }
  });

  it('paciente no propietario recibe chat:error FORBIDDEN', async () => {
    const socket = ioClient(`http://localhost:${serverPort}/chat`, {
      auth: { token: patientBToken },
      transports: ['websocket'],
    });
    try {
      await waitForConnect(socket);
      socket.emit('chat:join', { consultationId });
      const err = await waitForEvent<{ code: string; message: string }>(socket, 'chat:error');
      expect(err.code).toBe('FORBIDDEN');
    } finally {
      socket.disconnect();
    }
  });

  it('GET /consultations/:id/messages — participante recibe 200', async () => {
    await request(app.getHttpServer())
      .get(`/v1/consultations/${consultationId}/messages`)
      .set('Authorization', `Bearer ${patientAToken}`)
      .expect(200)
      .expect((res) => {
        expect(Array.isArray(res.body)).toBe(true);
      });
  });

  it('GET /consultations/:id/messages — no participante recibe 403', async () => {
    await request(app.getHttpServer())
      .get(`/v1/consultations/${consultationId}/messages`)
      .set('Authorization', `Bearer ${patientBToken}`)
      .expect(403);
  });

  it('consulta cerrada: paciente puede unirse en modo lectura y recibir historial', async () => {
    // Doctor closes the consultation
    await request(app.getHttpServer())
      .patch(`/v1/consultations/${consultationId}/close`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ summary: 'Caso leve resuelto.' })
      .expect(200);

    const socket = ioClient(`http://localhost:${serverPort}/chat`, {
      auth: { token: patientAToken },
      transports: ['websocket'],
    });
    try {
      await waitForConnect(socket);
      socket.emit('chat:join', { consultationId });
      const history = await waitForEvent<{ messages: unknown[] }>(socket, 'chat:history');
      expect(Array.isArray(history.messages)).toBe(true);
    } finally {
      socket.disconnect();
    }
  });

  it('token inválido en handshake → connect_error', async () => {
    const socket = ioClient(`http://localhost:${serverPort}/chat`, {
      auth: { token: 'not-a-valid-jwt-token' },
      transports: ['websocket'],
      reconnection: false,
    });
    try {
      const err = await waitForConnectError(socket);
      expect(err).toBeInstanceOf(Error);
    } finally {
      socket.disconnect();
    }
  });
});
