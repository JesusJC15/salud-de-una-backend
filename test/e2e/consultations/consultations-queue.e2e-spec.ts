import { DoctorStatus } from '../../../src/common/enums/doctor-status.enum';
import { E2eTestContext } from '../support/e2e-harness';
import {
  registerDoctorAndLogin,
  seedAdminAndLogin,
  verifyDoctorAsAdmin,
} from '../support/flows';

describe('E2E Consultations / Queue Access', () => {
  let context: E2eTestContext;

  beforeAll(async () => {
    context = await E2eTestContext.create();
  });

  beforeEach(async () => {
    await context.resetState({ seedDefaultAdmin: true });
  });

  afterAll(async () => {
    await context.close();
  });

  it('blocks doctors with pending REThUS verification', async () => {
    const { session } = await registerDoctorAndLogin(context, {
      email: 'doctor-pending@example.com',
      password: 'StrongP@ss1',
    });

    await context
      .request()
      .get('/v1/consultations/queue')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(403);
  });

  it('allows verified doctors into the queue', async () => {
    const doctor = await registerDoctorAndLogin(context, {
      email: 'doctor-ok@example.com',
      password: 'StrongP@ss1',
    });
    const { session: adminSession } = await seedAdminAndLogin(context, {
      email: 'admin@example.com',
      password: 'AdminP@ss1',
    });

    await verifyDoctorAsAdmin(context, {
      doctorId: doctor.doctorId,
      adminToken: adminSession.accessToken,
    });
    await context.waitForNotificationCount(doctor.doctorId, 1);

    const response = await context
      .request()
      .get('/v1/consultations/queue')
      .set('Authorization', `Bearer ${doctor.session.accessToken}`)
      .expect(200);

    expect(response.body).toEqual({ items: [] });
  });

  it('blocks rejected doctors from the queue', async () => {
    const doctor = await registerDoctorAndLogin(context, {
      email: 'doctor-rejected@example.com',
      password: 'StrongP@ss1',
    });
    const { session: adminSession } = await seedAdminAndLogin(context, {
      email: 'admin@example.com',
      password: 'AdminP@ss1',
    });

    await verifyDoctorAsAdmin(context, {
      doctorId: doctor.doctorId,
      adminToken: adminSession.accessToken,
      doctorStatus: DoctorStatus.REJECTED,
    });

    await context
      .request()
      .get('/v1/consultations/queue')
      .set('Authorization', `Bearer ${doctor.session.accessToken}`)
      .expect(403);
  });
});
