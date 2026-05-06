import { buildPatientRegistrationDto } from '../support/builders';
import type {
  AuthSessionResponseBody,
  HttpErrorResponseBody,
} from '../support/contracts';
import { E2eTestContext } from '../support/e2e-harness';
import {
  refreshSession,
  registerPatient,
  registerPatientAndLogin,
} from '../support/flows';

describe('E2E Auth / Patient Sessions', () => {
  let context: E2eTestContext;

  beforeAll(async () => {
    context = await E2eTestContext.create();
  });

  beforeEach(async () => {
    await context.resetState();
  });

  afterAll(async () => {
    await context.close();
  });

  it('registers a patient with sanitized response fields', async () => {
    const payload = buildPatientRegistrationDto({
      firstName: 'Ana',
      lastName: 'Lopez',
      email: 'ana@example.com',
      password: 'StrongP@ss1',
      birthDate: '1998-03-10',
      gender: 'FEMALE',
    });

    const response = await context
      .request()
      .post('/v1/auth/patient/register')
      .send(payload)
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

  it('rejects duplicate patient email', async () => {
    const payload = buildPatientRegistrationDto({
      firstName: 'Ana',
      lastName: 'Lopez',
      email: 'dup@example.com',
      password: 'StrongP@ss1',
      birthDate: '1998-03-10',
      gender: 'FEMALE',
    });

    await context.request().post('/v1/auth/patient/register').send(payload);

    await context
      .request()
      .post('/v1/auth/patient/register')
      .send(payload)
      .expect(409);
  });

  it('returns session tokens for valid credentials', async () => {
    await registerPatient(context, {
      firstName: 'Ana',
      lastName: 'Lopez',
      email: 'loginok@example.com',
      password: 'StrongP@ss1',
    });

    const response = await context
      .request()
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
    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.refreshToken).toEqual(expect.any(String));
  });

  it('rejects invalid credentials', async () => {
    await context
      .request()
      .post('/v1/auth/patient/login')
      .send({
        email: 'missing@example.com',
        password: 'WrongP@ss1',
      })
      .expect(401)
      .expect((res) => {
        const body = res.body as HttpErrorResponseBody;
        expect(body.message).toBe('Credenciales invalidas');
      });
  });

  it('validates invalid registration payloads', async () => {
    await context
      .request()
      .post('/v1/auth/patient/register')
      .send({
        firstName: 'Ana',
        lastName: 'Lopez',
        email: 'invalid-email',
        password: 'weak',
      })
      .expect(400);
  });

  it('rotates the refresh session', async () => {
    await registerPatient(context, {
      firstName: 'Ana',
      lastName: 'Lopez',
      email: 'refresh@example.com',
      password: 'StrongP@ss1',
    });

    const loginBody = await context.loginSession(
      'refresh@example.com',
      'StrongP@ss1',
      'patient',
    );
    const refreshBody = await refreshSession(context, loginBody.refreshToken);

    expect(refreshBody).toMatchObject({
      user: {
        email: 'refresh@example.com',
        role: 'PATIENT',
      },
    });
    expect(refreshBody.accessToken).toEqual(expect.any(String));
    expect(refreshBody.refreshToken).toEqual(expect.any(String));
  });

  it('returns the authenticated patient from the access token', async () => {
    const { credentials, session } = await registerPatientAndLogin(context, {
      firstName: 'Marta',
      lastName: 'Rojas',
      email: 'auth-me@example.com',
      password: 'StrongP@ss1',
    });

    const response = await context
      .request()
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      user: {
        email: credentials.email,
        role: 'PATIENT',
        isActive: true,
      },
    });
  });

  it('revokes the current refresh session on logout', async () => {
    const { credentials, session } = await registerPatientAndLogin(context, {
      firstName: 'Eva',
      lastName: 'Lopez',
      email: 'logout@example.com',
      password: 'StrongP@ss1',
    });

    expect(credentials.email).toBe('logout@example.com');

    await context
      .request()
      .post('/v1/auth/logout')
      .send({ refreshToken: session.refreshToken })
      .expect(200);

    await context
      .request()
      .post('/v1/auth/refresh')
      .send({ refreshToken: session.refreshToken })
      .expect(401);
  });

  it('rejects invalid refresh tokens', async () => {
    await context
      .request()
      .post('/v1/auth/refresh')
      .send({ refreshToken: 'invalid-token' })
      .expect(401);
  });
});
