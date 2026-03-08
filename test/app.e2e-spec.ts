import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
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

describe('Epic 1 HU-001/HU-002 (e2e)', () => {
  let app: INestApplication<App>;
  let mongoServer: MongoMemoryReplSet;
  let adminModel: Model<AdminDocument>;
  let patientModel: Model<PatientDocument>;
  let doctorModel: Model<DoctorDocument>;
  let rethusVerificationModel: Model<RethusVerificationDocument>;
  let notificationModel: Model<NotificationDocument>;

  const adminEmail = 'admin@example.com';
  const adminPassword = 'AdminP@ss1';

  type LoginResponseBody = {
    access_token: string;
  };

  type RegisterDoctorResponseBody = {
    id: string;
  };

  type HttpErrorBody = {
    message?: string | string[];
  };

  async function login(email: string, password: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password })
      .expect(200);

    const body = response.body as LoginResponseBody;
    return body.access_token;
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
    mongoServer = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
    });

    process.env.NODE_ENV = 'test';
    process.env.MONGODB_URI = mongoServer.getUri();
    process.env.JWT_SECRET = 'test-secret-12345678901234567890123456789012';
    process.env.JWT_ACCESS_EXPIRES_IN = '1h';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    process.env.ENABLE_BOOTSTRAP_ADMIN = 'false';

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('../src/app.module') as {
      AppModule: typeof import('../src/app.module').AppModule;
    };
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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
  });

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
        gender: 'F',
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
      gender: 'F',
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

  it('POST /v1/auth/login should return tokens for valid credentials', async () => {
    await request(app.getHttpServer()).post('/v1/auth/patient/register').send({
      firstName: 'Ana',
      lastName: 'Lopez',
      email: 'loginok@example.com',
      password: 'StrongP@ss1',
    });

    const response = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({
        email: 'loginok@example.com',
        password: 'StrongP@ss1',
      })
      .expect(200);

    expect(response.body).toHaveProperty('access_token');
    expect(response.body).toHaveProperty('refresh_token');
    expect(response.body).toMatchObject({
      user: {
        email: 'loginok@example.com',
        role: 'PATIENT',
      },
    });
  });

  it('POST /v1/auth/login should return 401 for invalid credentials', () => {
    return request(app.getHttpServer())
      .post('/v1/auth/login')
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
    const doctorToken = await login(doctorEmail, 'StrongP@ss1');

    await request(app.getHttpServer())
      .post(`/v1/admin/doctors/${doctorId}/doctor-verify`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send(buildRethusVerifyPayload())
      .expect(403);
  });

  it('POST /v1/admin/doctors/:doctorId/doctor-verify should return 404 when doctor does not exist', async () => {
    const adminToken = await login(adminEmail, adminPassword);
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
    const adminToken = await login(adminEmail, adminPassword);

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
    const doctorToken = await login(doctorEmail, 'StrongP@ss1');

    await request(app.getHttpServer())
      .get('/v1/consultations/queue')
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(403);
  });

  it('GET /v1/consultations/queue should allow verified doctor', async () => {
    const doctorEmail = 'doctor-ok@example.com';
    const doctorId = await registerDoctor(doctorEmail);
    const adminToken = await login(adminEmail, adminPassword);

    await request(app.getHttpServer())
      .post(`/v1/admin/doctors/${doctorId}/doctor-verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(buildRethusVerifyPayload())
      .expect(201);

    const doctorToken = await login(doctorEmail, 'StrongP@ss1');
    const response = await request(app.getHttpServer())
      .get('/v1/consultations/queue')
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);

    expect(response.body).toEqual({ items: [] });
  });

  it('GET /v1/consultations/queue should block rejected doctor', async () => {
    const doctorEmail = 'doctor-rejected@example.com';
    const doctorId = await registerDoctor(doctorEmail);
    const adminToken = await login(adminEmail, adminPassword);

    await request(app.getHttpServer())
      .post(`/v1/admin/doctors/${doctorId}/doctor-verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(buildRethusVerifyPayload('REJECTED'))
      .expect(201);

    const doctorToken = await login(doctorEmail, 'StrongP@ss1');
    await request(app.getHttpServer())
      .get('/v1/consultations/queue')
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(403);
  });
});
