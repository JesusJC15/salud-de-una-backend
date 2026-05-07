import { buildDoctorRegistrationDto } from '../support/builders';
import type { AuthSessionResponseBody } from '../support/contracts';
import { E2eTestContext } from '../support/e2e-harness';
import { registerDoctor, registerPatientAndLogin } from '../support/flows';

describe('E2E Patients / Profile Management', () => {
  let context: E2eTestContext;

  beforeAll(async () => {
    context = await E2eTestContext.create();
  });

  beforeEach(async () => {
    await context.resetState();
  });

  afterAll(async () => {
    if (context) {
      await context.close();
    }
  });

  it('returns the patient profile for patient role', async () => {
    const { session } = await registerPatientAndLogin(context, {
      firstName: 'Lina',
      lastName: 'Suarez',
      email: 'patient-me@example.com',
      password: 'StrongP@ss1',
    });

    const response = await context
      .request()
      .get('/v1/patients/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      firstName: 'Lina',
      lastName: 'Suarez',
      email: 'patient-me@example.com',
      role: 'PATIENT',
    });
  });

  it('updates the patient profile', async () => {
    const { session } = await registerPatientAndLogin(context, {
      firstName: 'Lina',
      lastName: 'Suarez',
      email: 'patient-update@example.com',
      password: 'StrongP@ss1',
    });

    const response = await context
      .request()
      .put('/v1/patients/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ firstName: 'Laura' })
      .expect(200);

    expect(response.body).toMatchObject({
      firstName: 'Laura',
      email: 'patient-update@example.com',
    });
  });

  it('requires authentication for profile update', async () => {
    await context
      .request()
      .put('/v1/patients/me')
      .send({ firstName: 'Laura' })
      .expect(401);
  });

  it('forbids non-patient actors from updating patient profile', async () => {
    const doctorPayload = buildDoctorRegistrationDto({
      email: 'patient-update-forbidden@example.com',
      password: 'StrongP@ss1',
    });
    await registerDoctor(context, doctorPayload);

    const doctorToken = await context.login(
      doctorPayload.email,
      doctorPayload.password,
      'staff',
    );

    await context
      .request()
      .put('/v1/patients/me')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ firstName: 'Laura' })
      .expect(403);
  });

  it('rejects incoherent password payloads', async () => {
    const { session } = await registerPatientAndLogin(context, {
      firstName: 'Lina',
      lastName: 'Suarez',
      email: 'patient-incoherent@example.com',
      password: 'StrongP@ss1',
    });

    await context
      .request()
      .put('/v1/patients/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ currentPassword: 'StrongP@ss1' })
      .expect(400);
  });

  it('rejects null email updates', async () => {
    const { session } = await registerPatientAndLogin(context, {
      firstName: 'Lina',
      lastName: 'Suarez',
      email: 'patient-null-email@example.com',
      password: 'StrongP@ss1',
    });

    await context
      .request()
      .put('/v1/patients/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ email: null })
      .expect(400);
  });

  it('changes email and keeps current refresh session usable', async () => {
    const { session } = await registerPatientAndLogin(context, {
      firstName: 'Lina',
      lastName: 'Suarez',
      email: 'patient-email-change@example.com',
      password: 'StrongP@ss1',
    });

    const updateResponse = await context
      .request()
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

    await context
      .request()
      .post('/v1/auth/patient/login')
      .send({
        email: 'patient-email-change@example.com',
        password: 'StrongP@ss1',
      })
      .expect(401);

    await context
      .request()
      .post('/v1/auth/patient/login')
      .send({
        email: 'patient-email-new@example.com',
        password: 'StrongP@ss1',
      })
      .expect(200);

    await context
      .request()
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

    await context
      .request()
      .post('/v1/auth/refresh')
      .send({ refreshToken: session.refreshToken })
      .expect(200)
      .expect((res) => {
        const body = res.body as AuthSessionResponseBody;
        expect(body.user.email).toBe('patient-email-new@example.com');
      });
  });

  it('rejects email changes with invalid current password', async () => {
    const { session } = await registerPatientAndLogin(context, {
      firstName: 'Lina',
      lastName: 'Suarez',
      email: 'patient-email-bad-pass@example.com',
      password: 'StrongP@ss1',
    });

    await context
      .request()
      .put('/v1/patients/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        email: 'patient-email-bad-pass-new@example.com',
        currentPassword: 'WrongP@ss1',
      })
      .expect(400);
  });

  it('rejects email changes to an existing account', async () => {
    await registerPatientAndLogin(context, {
      firstName: 'Lina',
      lastName: 'Suarez',
      email: 'patient-email-taken-1@example.com',
      password: 'StrongP@ss1',
    });
    const secondPatient = await registerPatientAndLogin(context, {
      firstName: 'Marta',
      lastName: 'Rojas',
      email: 'patient-email-taken-2@example.com',
      password: 'StrongP@ss1',
    });

    await context
      .request()
      .put('/v1/patients/me')
      .set('Authorization', `Bearer ${secondPatient.session.accessToken}`)
      .send({
        email: 'patient-email-taken-1@example.com',
        currentPassword: 'StrongP@ss1',
      })
      .expect(409);
  });

  it('changes password and revokes previous refresh sessions', async () => {
    const { session } = await registerPatientAndLogin(context, {
      firstName: 'Lina',
      lastName: 'Suarez',
      email: 'patient-password-change@example.com',
      password: 'StrongP@ss1',
    });

    await context
      .request()
      .put('/v1/patients/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        currentPassword: 'StrongP@ss1',
        newPassword: 'NuevaP@ss2',
      })
      .expect(200);

    await context
      .request()
      .post('/v1/auth/patient/login')
      .send({
        email: 'patient-password-change@example.com',
        password: 'StrongP@ss1',
      })
      .expect(401);

    await context
      .request()
      .post('/v1/auth/patient/login')
      .send({
        email: 'patient-password-change@example.com',
        password: 'NuevaP@ss2',
      })
      .expect(200);

    await context
      .request()
      .post('/v1/auth/refresh')
      .send({ refreshToken: session.refreshToken })
      .expect(401);
  });
});
