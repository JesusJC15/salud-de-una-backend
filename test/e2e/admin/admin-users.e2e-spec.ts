import type {
  AdminUserActiveResponseBody,
  AdminUserDetailResponseBody,
  AdminUsersListResponseBody,
} from '../support/contracts';
import { E2eTestContext } from '../support/e2e-harness';
import {
  registerDoctor,
  registerPatientAndLogin,
  seedAdminAndLogin,
} from '../support/flows';

describe('E2E Admin / Users Management', () => {
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

  it('returns 403 for non-admin users', async () => {
    const { session } = await registerPatientAndLogin(context, {
      firstName: 'Ana',
      lastName: 'Lopez',
      email: 'users-rbac-patient@example.com',
      password: 'StrongP@ss1',
    });

    await context
      .request()
      .get('/v1/admin/users')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(403);
  });

  it('lists users, fetches detail and updates activation state', async () => {
    const { session } = await seedAdminAndLogin(context, {
      email: 'admin@example.com',
      password: 'AdminP@ss1',
    });

    await registerPatientAndLogin(context, {
      firstName: 'Lina',
      lastName: 'UserCrud',
      email: 'patient-user-crud@example.com',
      password: 'StrongP@ss1',
    });
    const doctor = await registerDoctor(context, {
      email: 'doctor-user-crud@example.com',
      password: 'StrongP@ss1',
    });

    const listResponse = await context
      .request()
      .get('/v1/admin/users/DOCTOR?page=1&limit=10')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    const listBody = listResponse.body as AdminUsersListResponseBody;

    expect(Array.isArray(listBody.items)).toBe(true);
    expect(listBody.items.some((item) => item.id === doctor.body.id)).toBe(
      true,
    );

    await context
      .request()
      .get(`/v1/admin/users/DOCTOR/${doctor.body.id}`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200)
      .expect((res) => {
        const body = res.body as AdminUserDetailResponseBody;
        expect(body.id).toBe(doctor.body.id);
        expect(body.role).toBe('DOCTOR');
      });

    await context
      .request()
      .patch(`/v1/admin/users/DOCTOR/${doctor.body.id}/active`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ isActive: false })
      .expect(200)
      .expect((res) => {
        const body = res.body as AdminUserActiveResponseBody;
        expect(body.isActive).toBe(false);
      });
  });
});
