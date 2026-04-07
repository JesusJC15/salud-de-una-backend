import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { getModelToken } from '@nestjs/mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import * as bcrypt from 'bcrypt';
import { Model, Types } from 'mongoose';
import { Admin, AdminDocument } from '../src/admins/schemas/admin.schema';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { Doctor, DoctorDocument } from '../src/doctors/schemas/doctor.schema';
import {
  RethusVerification,
  RethusVerificationDocument,
} from '../src/doctors/schemas/rethus-verification.schema';
import {
  Notification,
  NotificationDocument,
} from '../src/notifications/schemas/notification.schema';
import {
  Patient,
  PatientDocument,
} from '../src/patients/schemas/patient.schema';
import { DoctorStatus } from '../src/common/enums/doctor-status.enum';
import { RethusState } from '../src/common/enums/rethus-state.enum';

jest.mock('dotenv/config', () => ({}));
jest.setTimeout(120_000);

describe('Epic 1 HU-001/HU-002 (e2e)', () => {
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
  let adminModel: Model<AdminDocument>;
  let patientModel: Model<PatientDocument>;
  let doctorModel: Model<DoctorDocument>;
  let rethusVerificationModel: Model<RethusVerificationDocument>;
  let notificationModel: Model<NotificationDocument>;

  const adminEmail = 'admin@example.com';
  const adminPassword = 'AdminP@ss1';

  type RegisterDoctorResponseBody = {
    id: string;
  };

  type HttpErrorBody = {
    message?: string | string[];
  };

  type AuthSessionResponseBody = {
    accessToken: string;
    refreshToken: string;
    user: {
      id: string;
      email: string;
      role: string;
    };
  };

  type AdminDoctorsListResponseBody = {
    summary: {
      total: number;
      pending: number;
      verified: number;
      rejected: number;
    };
    items: Array<{
      id: string;
      doctorStatus: string;
      latestVerification: {
        rethusState: string;
      } | null;
    }>;
  };

  type NotificationsListResponseBody = {
    unreadCount: number;
    items: Array<{
      id: string;
      type: string;
      read: boolean;
    }>;
  };

  type MarkNotificationReadResponseBody = {
    read: boolean;
  };

  type BusinessDashboardResponseBody = {
    kpis: {
      totalPatients: number;
      totalDoctors: number;
      verifiedDoctors: number;
      pendingDoctors: number;
    };
    doctorStatusBreakdown: {
      verified: number;
      pending: number;
      rejected: number;
    };
    operationalSignals: {
      unreadNotifications: number;
      verificationCoverage: number;
    };
  };

  type ReadinessResponseBody = {
    status: 'ready' | 'not_ready';
    checks: {
      database: { status: 'up' | 'down' };
      redis: { status: 'up' | 'down' | 'disabled'; degraded: boolean };
      ai: { status: 'up' | 'degraded' | 'disabled'; degraded: boolean };
    };
  };

  type AiHealthCheckResponseBody = {
    provider: string;
    model: string;
    status: 'up' | 'down' | 'disabled';
    degraded: boolean;
    requestId: string;
  };

  type TechnicalDashboardResponseBody = {
    sampleSize: number;
    p95LatencyMs: number;
    errorRate: number;
    source: string;
    degraded: boolean;
  };

  async function login(
    email: string,
    password: string,
    client: 'patient' | 'staff',
  ): Promise<string> {
    const body = await loginSession(email, password, client);
    return body.accessToken;
  }

  async function loginSession(
    email: string,
    password: string,
    client: 'patient' | 'staff',
  ): Promise<AuthSessionResponseBody> {
    const response = await request(app.getHttpServer())
      .post(
        client === 'patient'
          ? '/v1/auth/patient/login'
          : '/v1/auth/staff/login',
      )
      .send({ email, password })
      .expect(200);

    return response.body as AuthSessionResponseBody;
  }

  async function registerDoctor(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/v1/auth/doctor/register')
      .send({
        firstName: 'Laura',
        lastName: 'Medina',
        email,
        password: 'StrongP@ss1',
        specialty: 'GENERAL_MEDICINE',
        personalId: `CC-${Date.now()}`,
        phoneNumber: '3001234567',
      })
      .expect(201);

    const body = response.body as RegisterDoctorResponseBody;
    return body.id;
  }

  async function waitForNotificationCount(
    userId: string,
    expectedCount: number,
    timeoutMs = 2_000,
  ): Promise<void> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const count = await notificationModel
        .countDocuments({
          userId: new Types.ObjectId(userId),
          type: 'DOCTOR_STATUS_CHANGE',
        })
        .exec();

      if (count === expectedCount) {
        return;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
    }

    throw new Error(
      `Timed out waiting for ${expectedCount} notifications for user ${userId}`,
    );
  }

  function buildRethusVerifyPayload(
    doctorStatus: DoctorStatus = DoctorStatus.VERIFIED,
  ) {
    return {
      programType: 'UNIVERSITY',
      titleObtainingOrigin: 'LOCAL',
      professionOccupation: 'MEDICO GENERAL',
      startDate: '2024-01-15',
      rethusState:
        doctorStatus === DoctorStatus.REJECTED
          ? RethusState.EXPIRED
          : RethusState.VALID,
      administrativeAct: 'ACT-2026-001',
      reportingEntity: 'MINISTERIO DE SALUD',
      notes: 'Validado por pruebas e2e',
    };
  }

  beforeAll(async () => {
    jest.spyOn(ThrottlerGuard.prototype, 'canActivate').mockResolvedValue(true);
    mongoServer = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
    });

    process.env.NODE_ENV = 'test';
    process.env.DOTENV_CONFIG_PATH = 'test/.env.does-not-exist';
    process.env.MONGODB_URI = mongoServer.getUri();
    process.env.JWT_SECRET = 'test-secret-12345678901234567890123456789012';
    process.env.JWT_ACCESS_EXPIRES_IN = '1h';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    process.env.ENABLE_BOOTSTRAP_ADMIN = 'false';
    process.env.AI_ENABLED = 'false';
    process.env.AI_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = '';
    process.env.GEMINI_MODEL = '';
    process.env.REDIS_URL = '';
    process.env.REDIS_KEY_PREFIX = 'salud-de-una-e2e';
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

    adminModel = app.get<Model<AdminDocument>>(getModelToken(Admin.name));
    patientModel = app.get<Model<PatientDocument>>(getModelToken(Patient.name));
    doctorModel = app.get<Model<DoctorDocument>>(getModelToken(Doctor.name));
    rethusVerificationModel = app.get<Model<RethusVerificationDocument>>(
      getModelToken(RethusVerification.name),
    );
    notificationModel = app.get<Model<NotificationDocument>>(
      getModelToken(Notification.name),
    );
  }, 120_000);

  beforeEach(async () => {
    await Promise.all([
      adminModel.deleteMany({}),
      patientModel.deleteMany({}),
      doctorModel.deleteMany({}),
      rethusVerificationModel.deleteMany({}),
      notificationModel.deleteMany({}),
    ]);

    const passwordHash = await bcrypt.hash(adminPassword, 12);
    await adminModel.create({
      firstName: 'System',
      lastName: 'Admin',
      email: adminEmail,
      passwordHash,
    });
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

  it('POST /v1/auth/patient/register should create a patient', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/auth/patient/register')
      .send({
        firstName: 'Ana',
        lastName: 'Lopez',
        email: 'ana@example.com',
        password: 'StrongP@ss1',
        birthDate: '1998-03-10',
        gender: 'FEMALE',
      })
      .expect(201);

    expect(response.body).toMatchObject({
      firstName: 'Ana',
      lastName: 'Lopez',
      email: 'ana@example.com',
      role: 'PATIENT',
    });
    expect(response.body).toHaveProperty('id');
    expect(response.body).not.toHaveProperty('password');
    expect(response.body).not.toHaveProperty('passwordHash');
  });

  it('POST /v1/auth/patient/register should return 409 on duplicate email', async () => {
    await request(app.getHttpServer()).post('/v1/auth/patient/register').send({
      firstName: 'Ana',
      lastName: 'Lopez',
      email: 'dup@example.com',
      password: 'StrongP@ss1',
      birthDate: '1998-03-10',
      gender: 'FEMALE',
    });

    return request(app.getHttpServer())
      .post('/v1/auth/patient/register')
      .send({
        firstName: 'Ana',
        lastName: 'Lopez',
        email: 'dup@example.com',
        password: 'StrongP@ss1',
      })
      .expect(409);
  });

  it('POST /v1/auth/doctor/register should return 409 on duplicate personalId', async () => {
    const sharedPersonalId = 'CC-DUPLICATE-TEST';

    await request(app.getHttpServer())
      .post('/v1/auth/doctor/register')
      .send({
        firstName: 'Laura',
        lastName: 'Medina',
        email: 'dup-personalid-1@example.com',
        password: 'StrongP@ss1',
        specialty: 'GENERAL_MEDICINE',
        personalId: sharedPersonalId,
        phoneNumber: '3001234567',
      })
      .expect(201);

    return request(app.getHttpServer())
      .post('/v1/auth/doctor/register')
      .send({
        firstName: 'Carlos',
        lastName: 'Ruiz',
        email: 'dup-personalid-2@example.com',
        password: 'StrongP@ss1',
        specialty: 'GENERAL_MEDICINE',
        personalId: sharedPersonalId,
        phoneNumber: '3009876543',
      })
      .expect(409);
  });

  it('POST /v1/auth/patient/login should return session tokens for valid credentials', async () => {
    await request(app.getHttpServer()).post('/v1/auth/patient/register').send({
      firstName: 'Ana',
      lastName: 'Lopez',
      email: 'loginok@example.com',
      password: 'StrongP@ss1',
    });

    const response = await request(app.getHttpServer())
      .post('/v1/auth/patient/login')
      .send({
        email: 'loginok@example.com',
        password: 'StrongP@ss1',
      })
      .expect(200);

    const body = response.body as AuthSessionResponseBody;

    expect(body).toMatchObject({
      user: {
        email: 'loginok@example.com',
        role: 'PATIENT',
      },
    });
    expect(typeof body.accessToken).toBe('string');
    expect(body.accessToken.length).toBeGreaterThan(0);
    expect(typeof body.refreshToken).toBe('string');
    expect(body.refreshToken.length).toBeGreaterThan(0);
  });

  it('POST /v1/auth/patient/login should return 401 for invalid credentials', () => {
    return request(app.getHttpServer())
      .post('/v1/auth/patient/login')
      .send({
        email: 'missing@example.com',
        password: 'WrongP@ss1',
      })
      .expect(401)
      .expect((res) => {
        const body = res.body as HttpErrorBody;
        expect(body.message).toBe('Credenciales invalidas');
      });
  });

  it('POST /v1/auth/patient/register should return 400 for invalid payload', () => {
    return request(app.getHttpServer())
      .post('/v1/auth/patient/register')
      .send({
        firstName: 'Ana',
        lastName: 'Lopez',
        email: 'invalid-email',
        password: 'weak',
      })
      .expect(400);
  });

  it('POST /v1/admin/doctors/:doctorId/doctor-verify should return 403 for non-admin', async () => {
    const doctorEmail = 'doctor-rbac@example.com';
    const doctorId = await registerDoctor(doctorEmail);
    const doctorToken = await login(doctorEmail, 'StrongP@ss1', 'staff');

    await request(app.getHttpServer())
      .post(`/v1/admin/doctors/${doctorId}/doctor-verify`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send(buildRethusVerifyPayload())
      .expect(403);
  });

  it('POST /v1/admin/doctors/:doctorId/doctor-verify should return 404 when doctor does not exist', async () => {
    const adminToken = await login(adminEmail, adminPassword, 'staff');
    const missingDoctorId = new Types.ObjectId().toString();

    await request(app.getHttpServer())
      .post(`/v1/admin/doctors/${missingDoctorId}/doctor-verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(buildRethusVerifyPayload())
      .expect(404);
  });

  it('POST /v1/admin/doctors/:doctorId/doctor-verify should verify doctor and create records', async () => {
    const doctorEmail = 'doctor-verify@example.com';
    const doctorId = await registerDoctor(doctorEmail);
    const adminToken = await login(adminEmail, adminPassword, 'staff');

    const response = await request(app.getHttpServer())
      .post(`/v1/admin/doctors/${doctorId}/doctor-verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(buildRethusVerifyPayload())
      .expect(201);

    expect(response.body).toMatchObject({
      doctorId,
      doctorStatus: 'VERIFIED',
    });

    const doctor = await doctorModel.findById(doctorId).lean().exec();
    expect(doctor?.doctorStatus).toBe('VERIFIED');

    const verificationCount = await rethusVerificationModel
      .countDocuments({ doctorId: new Types.ObjectId(doctorId) })
      .exec();
    expect(verificationCount).toBe(1);

    await waitForNotificationCount(doctorId, 1);

    const notificationCount = await notificationModel
      .countDocuments({
        userId: new Types.ObjectId(doctorId),
        type: 'DOCTOR_STATUS_CHANGE',
      })
      .exec();
    expect(notificationCount).toBe(1);
  });

  it('GET /v1/consultations/queue should block doctor with pending REThUS', async () => {
    const doctorEmail = 'doctor-pending@example.com';
    await registerDoctor(doctorEmail);
    const doctorToken = await login(doctorEmail, 'StrongP@ss1', 'staff');

    await request(app.getHttpServer())
      .get('/v1/consultations/queue')
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(403);
  });

  it('GET /v1/consultations/queue should allow verified doctor', async () => {
    const doctorEmail = 'doctor-ok@example.com';
    const doctorId = await registerDoctor(doctorEmail);
    const adminToken = await login(adminEmail, adminPassword, 'staff');

    await request(app.getHttpServer())
      .post(`/v1/admin/doctors/${doctorId}/doctor-verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(buildRethusVerifyPayload())
      .expect(201);

    await waitForNotificationCount(doctorId, 1);

    const doctorToken = await login(doctorEmail, 'StrongP@ss1', 'staff');
    const response = await request(app.getHttpServer())
      .get('/v1/consultations/queue')
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);

    expect(response.body).toEqual({ items: [] });
  });

  it('GET /v1/consultations/queue should block rejected doctor', async () => {
    const doctorEmail = 'doctor-rejected@example.com';
    const doctorId = await registerDoctor(doctorEmail);
    const adminToken = await login(adminEmail, adminPassword, 'staff');

    await request(app.getHttpServer())
      .post(`/v1/admin/doctors/${doctorId}/doctor-verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(buildRethusVerifyPayload(DoctorStatus.REJECTED))
      .expect(201);

    const doctorToken = await login(doctorEmail, 'StrongP@ss1', 'staff');
    await request(app.getHttpServer())
      .get('/v1/consultations/queue')
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(403);
  });

  it('GET /v1/patients/me should return patient profile for patient role', async () => {
    await request(app.getHttpServer()).post('/v1/auth/patient/register').send({
      firstName: 'Lina',
      lastName: 'Suarez',
      email: 'patient-me@example.com',
      password: 'StrongP@ss1',
    });

    const patientToken = await login(
      'patient-me@example.com',
      'StrongP@ss1',
      'patient',
    );

    const response = await request(app.getHttpServer())
      .get('/v1/patients/me')
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      firstName: 'Lina',
      lastName: 'Suarez',
      email: 'patient-me@example.com',
      role: 'PATIENT',
    });
  });

  it('PUT /v1/patients/me should update patient profile', async () => {
    await request(app.getHttpServer()).post('/v1/auth/patient/register').send({
      firstName: 'Lina',
      lastName: 'Suarez',
      email: 'patient-update@example.com',
      password: 'StrongP@ss1',
    });

    const patientToken = await login(
      'patient-update@example.com',
      'StrongP@ss1',
      'patient',
    );

    const response = await request(app.getHttpServer())
      .put('/v1/patients/me')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ firstName: 'Laura' })
      .expect(200);

    expect(response.body).toMatchObject({
      firstName: 'Laura',
      email: 'patient-update@example.com',
    });
  });

  it('PUT /v1/patients/me should return 401 without token', async () => {
    await request(app.getHttpServer())
      .put('/v1/patients/me')
      .send({ firstName: 'Laura' })
      .expect(401);
  });

  it('PUT /v1/patients/me should return 403 for non-patient role', async () => {
    const doctorEmail = 'patient-update-forbidden@example.com';
    await registerDoctor(doctorEmail);
    const doctorToken = await login(doctorEmail, 'StrongP@ss1', 'staff');

    await request(app.getHttpServer())
      .put('/v1/patients/me')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ firstName: 'Laura' })
      .expect(403);
  });

  it('PUT /v1/patients/me should return 400 for incoherent password payload', async () => {
    await request(app.getHttpServer()).post('/v1/auth/patient/register').send({
      firstName: 'Lina',
      lastName: 'Suarez',
      email: 'patient-incoherent@example.com',
      password: 'StrongP@ss1',
    });

    const patientToken = await login(
      'patient-incoherent@example.com',
      'StrongP@ss1',
      'patient',
    );

    await request(app.getHttpServer())
      .put('/v1/patients/me')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ currentPassword: 'StrongP@ss1' })
      .expect(400);
  });

  it('PUT /v1/patients/me should return 400 when email is null', async () => {
    await request(app.getHttpServer()).post('/v1/auth/patient/register').send({
      firstName: 'Lina',
      lastName: 'Suarez',
      email: 'patient-null-email@example.com',
      password: 'StrongP@ss1',
    });

    const patientToken = await login(
      'patient-null-email@example.com',
      'StrongP@ss1',
      'patient',
    );

    await request(app.getHttpServer())
      .put('/v1/patients/me')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ email: null })
      .expect(400);
  });

  it('PUT /v1/patients/me should change email with current password and keep refresh session usable', async () => {
    await request(app.getHttpServer()).post('/v1/auth/patient/register').send({
      firstName: 'Lina',
      lastName: 'Suarez',
      email: 'patient-email-change@example.com',
      password: 'StrongP@ss1',
    });

    const session = await loginSession(
      'patient-email-change@example.com',
      'StrongP@ss1',
      'patient',
    );

    const updateResponse = await request(app.getHttpServer())
      .put('/v1/patients/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        email: 'patient-email-new@example.com',
        currentPassword: 'StrongP@ss1',
      })
      .expect(200);

    expect(updateResponse.body).toMatchObject({
      email: 'patient-email-new@example.com',
    });

    await request(app.getHttpServer())
      .post('/v1/auth/patient/login')
      .send({
        email: 'patient-email-change@example.com',
        password: 'StrongP@ss1',
      })
      .expect(401);

    await request(app.getHttpServer())
      .post('/v1/auth/patient/login')
      .send({
        email: 'patient-email-new@example.com',
        password: 'StrongP@ss1',
      })
      .expect(200);

    await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200)
      .expect((res) => {
        expect(res.body).toMatchObject({
          user: {
            email: 'patient-email-new@example.com',
            role: 'PATIENT',
          },
        });
      });

    await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken: session.refreshToken })
      .expect(200)
      .expect((res) => {
        const body = res.body as AuthSessionResponseBody;
        expect(body.user.email).toBe('patient-email-new@example.com');
      });
  });

  it('PUT /v1/patients/me should return 400 when current password is incorrect', async () => {
    await request(app.getHttpServer()).post('/v1/auth/patient/register').send({
      firstName: 'Lina',
      lastName: 'Suarez',
      email: 'patient-email-bad-pass@example.com',
      password: 'StrongP@ss1',
    });

    const patientToken = await login(
      'patient-email-bad-pass@example.com',
      'StrongP@ss1',
      'patient',
    );

    await request(app.getHttpServer())
      .put('/v1/patients/me')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        email: 'patient-email-bad-pass-new@example.com',
        currentPassword: 'WrongP@ss1',
      })
      .expect(400);
  });

  it('PUT /v1/patients/me should return 409 when new email is already taken', async () => {
    await request(app.getHttpServer()).post('/v1/auth/patient/register').send({
      firstName: 'Lina',
      lastName: 'Suarez',
      email: 'patient-email-taken-1@example.com',
      password: 'StrongP@ss1',
    });

    await request(app.getHttpServer()).post('/v1/auth/patient/register').send({
      firstName: 'Marta',
      lastName: 'Rojas',
      email: 'patient-email-taken-2@example.com',
      password: 'StrongP@ss1',
    });

    const patientToken = await login(
      'patient-email-taken-1@example.com',
      'StrongP@ss1',
      'patient',
    );

    await request(app.getHttpServer())
      .put('/v1/patients/me')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        email: 'patient-email-taken-2@example.com',
        currentPassword: 'StrongP@ss1',
      })
      .expect(409);
  });

  it('PUT /v1/patients/me should change password and revoke previous refresh sessions', async () => {
    await request(app.getHttpServer()).post('/v1/auth/patient/register').send({
      firstName: 'Lina',
      lastName: 'Suarez',
      email: 'patient-password-change@example.com',
      password: 'StrongP@ss1',
    });

    const session = await loginSession(
      'patient-password-change@example.com',
      'StrongP@ss1',
      'patient',
    );

    await request(app.getHttpServer())
      .put('/v1/patients/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        currentPassword: 'StrongP@ss1',
        newPassword: 'NuevaP@ss2',
      })
      .expect(200);

    await request(app.getHttpServer())
      .post('/v1/auth/patient/login')
      .send({
        email: 'patient-password-change@example.com',
        password: 'StrongP@ss1',
      })
      .expect(401);

    await request(app.getHttpServer())
      .post('/v1/auth/patient/login')
      .send({
        email: 'patient-password-change@example.com',
        password: 'NuevaP@ss2',
      })
      .expect(200);

    await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken: session.refreshToken })
      .expect(401);
  });

  it('POST /v1/auth/refresh should rotate session when refresh token is provided', async () => {
    await request(app.getHttpServer()).post('/v1/auth/patient/register').send({
      firstName: 'Ana',
      lastName: 'Lopez',
      email: 'refresh@example.com',
      password: 'StrongP@ss1',
    });

    const loginResponse = await request(app.getHttpServer())
      .post('/v1/auth/patient/login')
      .send({ email: 'refresh@example.com', password: 'StrongP@ss1' })
      .expect(200);

    const loginBody = loginResponse.body as AuthSessionResponseBody;

    const refreshResponse = await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken: loginBody.refreshToken })
      .expect(200);

    const refreshBody = refreshResponse.body as AuthSessionResponseBody;

    expect(refreshBody).toMatchObject({
      user: {
        email: 'refresh@example.com',
        role: 'PATIENT',
      },
    });
    expect(typeof refreshBody.accessToken).toBe('string');
    expect(refreshBody.accessToken.length).toBeGreaterThan(0);
    expect(typeof refreshBody.refreshToken).toBe('string');
    expect(refreshBody.refreshToken.length).toBeGreaterThan(0);
  });

  it('GET /v1/auth/me should return authenticated user from access token', async () => {
    await request(app.getHttpServer()).post('/v1/auth/patient/register').send({
      firstName: 'Marta',
      lastName: 'Rojas',
      email: 'auth-me@example.com',
      password: 'StrongP@ss1',
    });

    const accessToken = await login(
      'auth-me@example.com',
      'StrongP@ss1',
      'patient',
    );

    const response = await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      user: {
        email: 'auth-me@example.com',
        role: 'PATIENT',
        isActive: true,
      },
    });
  });

  it('POST /v1/auth/logout should revoke current refresh session', async () => {
    await request(app.getHttpServer()).post('/v1/auth/patient/register').send({
      firstName: 'Eva',
      lastName: 'Lopez',
      email: 'logout@example.com',
      password: 'StrongP@ss1',
    });

    const loginResponse = await request(app.getHttpServer())
      .post('/v1/auth/patient/login')
      .send({ email: 'logout@example.com', password: 'StrongP@ss1' })
      .expect(200);

    const loginBody = loginResponse.body as AuthSessionResponseBody;

    await request(app.getHttpServer())
      .post('/v1/auth/logout')
      .send({ refreshToken: loginBody.refreshToken })
      .expect(200);

    await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken: loginBody.refreshToken })
      .expect(401);
  });

  it('GET /v1/admin/doctors should return doctor inbox for review with summary counts', async () => {
    const pendingDoctorId = await registerDoctor(
      'doctor-list-pending@example.com',
    );
    const verifiedDoctorId = await registerDoctor(
      'doctor-list-verified@example.com',
    );
    const adminToken = await login(adminEmail, adminPassword, 'staff');

    await request(app.getHttpServer())
      .post(`/v1/admin/doctors/${verifiedDoctorId}/doctor-verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(buildRethusVerifyPayload())
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/v1/admin/doctors')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const body = response.body as AdminDoctorsListResponseBody;

    expect(body.summary).toMatchObject({
      total: 2,
      pending: 1,
      verified: 1,
      rejected: 0,
    });
    expect(body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: pendingDoctorId,
          doctorStatus: 'PENDING',
          latestVerification: null,
        }),
        expect.objectContaining({
          id: verifiedDoctorId,
          doctorStatus: 'VERIFIED',
        }),
      ]),
    );

    const verifiedDoctor = body.items.find(
      (item) => item.id === verifiedDoctorId,
    );
    expect(verifiedDoctor?.latestVerification?.rethusState).toBe('VALID');
  });

  it('GET /v1/notifications/me and PATCH /v1/notifications/:id/read should let doctor consume notifications', async () => {
    const doctorEmail = 'doctor-notify@example.com';
    const doctorId = await registerDoctor(doctorEmail);
    const adminToken = await login(adminEmail, adminPassword, 'staff');

    await request(app.getHttpServer())
      .post(`/v1/admin/doctors/${doctorId}/doctor-verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(buildRethusVerifyPayload())
      .expect(201);

    await waitForNotificationCount(doctorId, 1);

    const doctorToken = await login(doctorEmail, 'StrongP@ss1', 'staff');

    const notificationsResponse = await request(app.getHttpServer())
      .get('/v1/notifications/me')
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);

    const notificationsBody =
      notificationsResponse.body as NotificationsListResponseBody;

    expect(notificationsBody.unreadCount).toBe(1);
    expect(notificationsBody.items).toHaveLength(1);
    expect(notificationsBody.items[0]).toMatchObject({
      type: 'DOCTOR_STATUS_CHANGE',
      read: false,
    });

    await request(app.getHttpServer())
      .patch(`/v1/notifications/${notificationsBody.items[0].id}/read`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200)
      .expect((res) => {
        const body = res.body as MarkNotificationReadResponseBody;
        expect(body.read).toBe(true);
      });

    const unreadResponse = await request(app.getHttpServer())
      .get('/v1/notifications/me?unreadOnly=true')
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);

    const unreadBody = unreadResponse.body as NotificationsListResponseBody;

    expect(unreadBody.unreadCount).toBe(0);
    expect(unreadBody.items).toHaveLength(0);
  });

  it('PATCH /v1/notifications/me/read-all should mark all as read', async () => {
    const doctorEmail = 'doctor-notify-all@example.com';
    const doctorId = await registerDoctor(doctorEmail);
    const adminToken = await login(adminEmail, adminPassword, 'staff');

    await request(app.getHttpServer())
      .post(`/v1/admin/doctors/${doctorId}/doctor-verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(buildRethusVerifyPayload())
      .expect(201);

    await waitForNotificationCount(doctorId, 1);

    const doctorToken = await login(doctorEmail, 'StrongP@ss1', 'staff');

    await request(app.getHttpServer())
      .patch('/v1/notifications/me/read-all')
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);

    const unreadResponse = await request(app.getHttpServer())
      .get('/v1/notifications/me?unreadOnly=true')
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);

    const unreadBody = unreadResponse.body as NotificationsListResponseBody;
    expect(unreadBody.unreadCount).toBe(0);
  });

  it('GET /v1/dashboard/business should return business KPIs from real persisted data', async () => {
    await request(app.getHttpServer()).post('/v1/auth/patient/register').send({
      firstName: 'Business',
      lastName: 'Patient',
      email: 'business-patient@example.com',
      password: 'StrongP@ss1',
    });

    const doctorId = await registerDoctor('doctor-business@example.com');
    const adminToken = await login(adminEmail, adminPassword, 'staff');

    await request(app.getHttpServer())
      .post(`/v1/admin/doctors/${doctorId}/doctor-verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(buildRethusVerifyPayload())
      .expect(201);

    await waitForNotificationCount(doctorId, 1);

    const response = await request(app.getHttpServer())
      .get('/v1/dashboard/business')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const body = response.body as BusinessDashboardResponseBody;

    expect(body.kpis).toMatchObject({
      totalPatients: 1,
      totalDoctors: 1,
      verifiedDoctors: 1,
      pendingDoctors: 0,
    });
    expect(body.doctorStatusBreakdown).toMatchObject({
      verified: 1,
      pending: 0,
      rejected: 0,
    });
    expect(body.operationalSignals).toMatchObject({
      unreadNotifications: 1,
      verificationCoverage: 100,
    });
  });

  it('GET /v1/dashboard/technical should return technical metrics', async () => {
    const adminToken = await login(adminEmail, adminPassword, 'staff');

    const response = await request(app.getHttpServer())
      .get('/v1/dashboard/technical')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const body = response.body as TechnicalDashboardResponseBody;

    expect(typeof body.sampleSize).toBe('number');
    expect(typeof body.p95LatencyMs).toBe('number');
    expect(typeof body.errorRate).toBe('number');
    expect(typeof body.source).toBe('string');
    expect(typeof body.degraded).toBe('boolean');
  });

  it('GET /v1/ready should report Redis and AI as degraded/disabled without failing readiness', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/ready')
      .expect(200);

    const body = response.body as ReadinessResponseBody;

    expect(body.status).toBe('ready');
    expect(body.checks.database.status).toBe('up');
    expect(body.checks.redis.status).toBe('disabled');
    expect(body.checks.ai.status).toBe('disabled');
  });

  it('POST /v1/admin/ai/health-check should report disabled when AI is not configured', async () => {
    const adminToken = await login(adminEmail, adminPassword, 'staff');

    const response = await request(app.getHttpServer())
      .post('/v1/admin/ai/health-check')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    const body = response.body as AiHealthCheckResponseBody;

    expect(body).toMatchObject({
      provider: 'gemini',
      status: 'disabled',
      degraded: true,
    });
    expect(typeof body.requestId).toBe('string');
  });

  it('POST /v1/auth/refresh should return 401 for invalid token', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken: 'invalid-token' })
      .expect(401);
  });
});
