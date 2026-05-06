import type {
  BusinessDashboardResponseBody,
  TechnicalDashboardResponseBody,
} from '../support/contracts';
import { E2eTestContext } from '../support/e2e-harness';
import {
  registerDoctor,
  registerPatient,
  seedAdminAndLogin,
  verifyDoctorAsAdmin,
} from '../support/flows';

describe('E2E Dashboard / Metrics', () => {
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

  it('returns business KPIs from persisted data', async () => {
    await registerPatient(context, {
      firstName: 'Business',
      lastName: 'Patient',
      email: 'business-patient@example.com',
      password: 'StrongP@ss1',
    });

    const doctor = await registerDoctor(context, {
      email: 'doctor-business@example.com',
      password: 'StrongP@ss1',
    });
    const { session } = await seedAdminAndLogin(context, {
      email: 'admin@example.com',
      password: 'AdminP@ss1',
    });

    await verifyDoctorAsAdmin(context, {
      doctorId: doctor.body.id,
      adminToken: session.accessToken,
    });
    await context.waitForNotificationCount(doctor.body.id, 1);

    const response = await context
      .request()
      .get('/v1/dashboard/business')
      .set('Authorization', `Bearer ${session.accessToken}`)
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

  it('returns technical metrics for admin users', async () => {
    const { session } = await seedAdminAndLogin(context, {
      email: 'admin@example.com',
      password: 'AdminP@ss1',
    });

    const response = await context
      .request()
      .get('/v1/dashboard/technical')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);

    const body = response.body as TechnicalDashboardResponseBody;
    expect(typeof body.sampleSize).toBe('number');
    expect(typeof body.p95LatencyMs).toBe('number');
    expect(typeof body.errorRate).toBe('number');
    expect(typeof body.source).toBe('string');
    expect(typeof body.degraded).toBe('boolean');
  });
});
