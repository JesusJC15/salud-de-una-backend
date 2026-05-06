import type {
  MarkNotificationReadResponseBody,
  NotificationsListResponseBody,
} from '../support/contracts';
import { E2eTestContext } from '../support/e2e-harness';
import {
  registerDoctorAndLogin,
  seedAdminAndLogin,
  verifyDoctorAsAdmin,
} from '../support/flows';

describe('E2E Notifications / Inbox', () => {
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

  it('lets doctors read a notification and consume their unread inbox', async () => {
    const doctor = await registerDoctorAndLogin(context, {
      email: 'doctor-notify@example.com',
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

    const notificationsResponse = await context
      .request()
      .get('/v1/notifications/me')
      .set('Authorization', `Bearer ${doctor.session.accessToken}`)
      .expect(200);

    const notificationsBody =
      notificationsResponse.body as NotificationsListResponseBody;
    expect(notificationsBody.unreadCount).toBe(1);
    expect(notificationsBody.items).toHaveLength(1);
    expect(notificationsBody.items[0]).toMatchObject({
      type: 'DOCTOR_STATUS_CHANGE',
      read: false,
    });

    await context
      .request()
      .patch(`/v1/notifications/${notificationsBody.items[0].id}/read`)
      .set('Authorization', `Bearer ${doctor.session.accessToken}`)
      .expect(200)
      .expect((res) => {
        const body = res.body as MarkNotificationReadResponseBody;
        expect(body.read).toBe(true);
      });

    const unreadResponse = await context
      .request()
      .get('/v1/notifications/me?unreadOnly=true')
      .set('Authorization', `Bearer ${doctor.session.accessToken}`)
      .expect(200);

    const unreadBody = unreadResponse.body as NotificationsListResponseBody;
    expect(unreadBody.unreadCount).toBe(0);
    expect(unreadBody.items).toHaveLength(0);
  });

  it('marks every notification as read with the bulk endpoint', async () => {
    const doctor = await registerDoctorAndLogin(context, {
      email: 'doctor-notify-all@example.com',
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

    await context
      .request()
      .patch('/v1/notifications/me/read-all')
      .set('Authorization', `Bearer ${doctor.session.accessToken}`)
      .expect(200);

    const unreadResponse = await context
      .request()
      .get('/v1/notifications/me?unreadOnly=true')
      .set('Authorization', `Bearer ${doctor.session.accessToken}`)
      .expect(200);

    const unreadBody = unreadResponse.body as NotificationsListResponseBody;
    expect(unreadBody.unreadCount).toBe(0);
  });
});
