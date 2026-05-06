import {
  Doctor,
  type DoctorDocument,
} from '../../../src/doctors/schemas/doctor.schema';
import { RethusVerification } from '../../../src/doctors/schemas/rethus-verification.schema';
import { Notification } from '../../../src/notifications/schemas/notification.schema';
import { DoctorStatus } from '../../../src/common/enums/doctor-status.enum';
import { Types } from 'mongoose';
import {
  buildDoctorRegistrationDto,
  buildRethusDecisionDto,
  buildRethusResubmissionDto,
  buildRethusVerifyPayload,
} from '../support/builders';
import type { AdminDoctorsListResponseBody } from '../support/contracts';
import { E2eTestContext } from '../support/e2e-harness';
import {
  registerDoctor,
  registerDoctorAndLogin,
  seedAdminAndLogin,
} from '../support/flows';

describe('E2E Doctors / Onboarding And Verification', () => {
  let context: E2eTestContext;

  beforeAll(async () => {
    context = await E2eTestContext.create();
  });

  beforeEach(async () => {
    await context.resetState({ seedDefaultAdmin: true });
  });

  afterAll(async () => {
    if (context) {
      await context.close();
    }
  });

  it('rejects duplicate doctor personalId', async () => {
    const sharedPersonalId = 'CC-DUPLICATE-TEST';

    await context
      .request()
      .post('/v1/auth/doctor/register')
      .send(
        buildDoctorRegistrationDto({
          email: 'dup-personalid-1@example.com',
          password: 'StrongP@ss1',
          personalId: sharedPersonalId,
        }),
      )
      .expect(201);

    await context
      .request()
      .post('/v1/auth/doctor/register')
      .send(
        buildDoctorRegistrationDto({
          firstName: 'Carlos',
          lastName: 'Ruiz',
          email: 'dup-personalid-2@example.com',
          password: 'StrongP@ss1',
          personalId: sharedPersonalId,
          phoneNumber: '3009876543',
        }),
      )
      .expect(409);
  });

  it('blocks doctor verification for non-admin actors', async () => {
    const { doctorId, credentials, session } = await registerDoctorAndLogin(
      context,
      {
        email: 'doctor-rbac@example.com',
        password: 'StrongP@ss1',
      },
    );

    expect(credentials.email).toBe('doctor-rbac@example.com');

    await context
      .request()
      .post(`/v1/admin/doctors/${doctorId}/doctor-verify`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send(buildRethusVerifyPayload())
      .expect(403);
  });

  it('returns 404 when verifying a missing doctor', async () => {
    const { session } = await seedAdminAndLogin(context, {
      email: 'admin@example.com',
      password: 'AdminP@ss1',
    });

    await context
      .request()
      .post('/v1/admin/doctors/681000000000000000000001/doctor-verify')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send(buildRethusVerifyPayload())
      .expect(404);
  });

  it('verifies doctor and persists verification plus notification side effects', async () => {
    const { body } = await registerDoctor(context, {
      email: 'doctor-verify@example.com',
      password: 'StrongP@ss1',
    });
    const { session } = await seedAdminAndLogin(context, {
      email: 'admin@example.com',
      password: 'AdminP@ss1',
    });

    const response = await context
      .request()
      .post(`/v1/admin/doctors/${body.id}/doctor-verify`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send(buildRethusVerifyPayload())
      .expect(201);

    expect(response.body).toMatchObject({
      doctorId: body.id,
      doctorStatus: 'VERIFIED',
    });

    const doctorModel = context.getModel<DoctorDocument>(Doctor.name);
    const verificationModel = context.getModel(RethusVerification.name);
    const notificationModel = context.getModel(Notification.name);

    const doctor = await doctorModel.findById(body.id).lean().exec();
    expect(doctor?.doctorStatus).toBe('VERIFIED');

    const verificationCount = await verificationModel
      .countDocuments({ doctorId: new Types.ObjectId(body.id) })
      .exec();
    expect(verificationCount).toBe(1);

    await context.waitForNotificationCount(body.id, 1);

    const notificationCount = await notificationModel
      .countDocuments({
        userId: new Types.ObjectId(body.id),
        type: 'DOCTOR_STATUS_CHANGE',
      })
      .exec();
    expect(notificationCount).toBe(1);
  });

  it('supports compact verification decision payloads', async () => {
    const { body } = await registerDoctor(context, {
      email: 'doctor-verify-compact@example.com',
      password: 'StrongP@ss1',
    });
    const { session } = await seedAdminAndLogin(context, {
      email: 'admin@example.com',
      password: 'AdminP@ss1',
    });

    const response = await context
      .request()
      .post(`/v1/admin/doctors/${body.id}/rethus-verify`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send(buildRethusDecisionDto())
      .expect(201);

    expect(response.body).toMatchObject({
      doctorId: body.id,
      doctorStatus: 'VERIFIED',
    });
  });

  it('exposes the doctors review alias endpoint', async () => {
    const { body } = await registerDoctor(context, {
      email: 'doctor-review-alias@example.com',
      password: 'StrongP@ss1',
    });
    const { session } = await seedAdminAndLogin(context, {
      email: 'admin@example.com',
      password: 'AdminP@ss1',
    });

    await context
      .request()
      .post(`/v1/admin/doctors/${body.id}/doctor-verify`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send(buildRethusVerifyPayload())
      .expect(201);

    const response = await context
      .request()
      .get('/v1/admin/doctors/review')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);

    const payload = response.body as AdminDoctorsListResponseBody;
    expect(Array.isArray(payload.items)).toBe(true);
    expect(payload.items.length).toBeGreaterThan(0);
  });

  it('allows rejected doctors to resubmit their REThUS evidence', async () => {
    const { body, payload } = await registerDoctor(context, {
      email: 'doctor-resubmit@example.com',
      password: 'StrongP@ss1',
    });
    const { session: adminSession } = await seedAdminAndLogin(context, {
      email: 'admin@example.com',
      password: 'AdminP@ss1',
    });

    await context
      .request()
      .post(`/v1/admin/doctors/${body.id}/doctor-verify`)
      .set('Authorization', `Bearer ${adminSession.accessToken}`)
      .send(buildRethusVerifyPayload(DoctorStatus.REJECTED))
      .expect(201);

    const doctorToken = await context.login(
      payload.email,
      payload.password,
      'staff',
    );

    const response = await context
      .request()
      .post('/v1/doctors/me/rethus-resubmit')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send(buildRethusResubmissionDto())
      .expect(201);

    expect(response.body).toMatchObject({
      doctorId: body.id,
      doctorStatus: 'PENDING',
    });
  });

  it('rejects REThUS resubmission when doctor is not in rejected status', async () => {
    const { payload } = await registerDoctor(context, {
      email: 'doctor-resubmit-invalid@example.com',
      password: 'StrongP@ss1',
    });

    const doctorToken = await context.login(
      payload.email,
      payload.password,
      'staff',
    );

    await context
      .request()
      .post('/v1/doctors/me/rethus-resubmit')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        evidenceUrl: 'https://example.com/new-rethus.pdf',
      })
      .expect(400);
  });

  it('lists doctors with summary counts for review inbox', async () => {
    const pendingDoctor = await registerDoctor(context, {
      email: 'doctor-list-pending@example.com',
      password: 'StrongP@ss1',
    });
    const verifiedDoctor = await registerDoctor(context, {
      email: 'doctor-list-verified@example.com',
      password: 'StrongP@ss1',
    });
    const { session } = await seedAdminAndLogin(context, {
      email: 'admin@example.com',
      password: 'AdminP@ss1',
    });

    await context
      .request()
      .post(`/v1/admin/doctors/${verifiedDoctor.body.id}/doctor-verify`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send(buildRethusVerifyPayload())
      .expect(201);

    const response = await context
      .request()
      .get('/v1/admin/doctors')
      .set('Authorization', `Bearer ${session.accessToken}`)
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
          id: pendingDoctor.body.id,
          doctorStatus: 'PENDING',
          latestVerification: null,
        }),
        expect.objectContaining({
          id: verifiedDoctor.body.id,
          doctorStatus: 'VERIFIED',
        }),
      ]),
    );

    const verifiedItem = body.items.find(
      (item) => item.id === verifiedDoctor.body.id,
    );
    expect(verifiedItem?.latestVerification?.rethusState).toBe('VALID');
  });
});
