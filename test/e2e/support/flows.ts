import { DoctorStatus } from '../../../src/common/enums/doctor-status.enum';
import {
  buildDoctorRegistrationDto,
  buildPatientRegistrationDto,
  buildRethusVerifyPayload,
} from './builders';
import type {
  AuthSessionResponseBody,
  CreateTriageSessionResponseBody,
  SaveTriageAnswersResponseBody,
} from './contracts';
import { E2eTestContext } from './e2e-harness';

export async function registerPatient(
  context: E2eTestContext,
  overrides: Partial<ReturnType<typeof buildPatientRegistrationDto>> = {},
) {
  type RegisteredPatientBody = {
    id: string;
    email: string;
    role: string;
    firstName: string;
    lastName: string;
  };

  const payload = buildPatientRegistrationDto(overrides);

  const response = await context
    .request()
    .post('/v1/auth/patient/register')
    .send(payload)
    .expect(201);

  const body = response.body as RegisteredPatientBody;

  return {
    payload,
    body,
  };
}

export async function registerPatientAndLogin(
  context: E2eTestContext,
  overrides: Partial<ReturnType<typeof buildPatientRegistrationDto>> = {},
) {
  const { payload, body } = await registerPatient(context, overrides);
  const session = await context.loginSession(
    payload.email,
    payload.password,
    'patient',
  );

  return {
    patient: body,
    credentials: payload,
    session,
  };
}

export async function registerDoctor(
  context: E2eTestContext,
  overrides: Partial<ReturnType<typeof buildDoctorRegistrationDto>> = {},
) {
  type RegisteredDoctorBody = {
    id: string;
  };

  const payload = buildDoctorRegistrationDto(overrides);

  const response = await context
    .request()
    .post('/v1/auth/doctor/register')
    .send(payload)
    .expect(201);

  const body = response.body as RegisteredDoctorBody;

  return {
    payload,
    body,
  };
}

export async function registerDoctorAndLogin(
  context: E2eTestContext,
  overrides: Partial<ReturnType<typeof buildDoctorRegistrationDto>> = {},
) {
  const { payload, body } = await registerDoctor(context, overrides);
  const session = await context.loginSession(
    payload.email,
    payload.password,
    'staff',
  );

  return {
    doctorId: body.id,
    credentials: payload,
    session,
  };
}

export async function seedAdminAndLogin(
  context: E2eTestContext,
  overrides: Parameters<E2eTestContext['seedAdmin']>[0] = {},
) {
  const admin = await context.seedAdmin(overrides);
  const session = await context.loginSession(
    admin.email,
    admin.password,
    'staff',
  );

  return {
    admin,
    session,
  };
}

export async function verifyDoctorAsAdmin(
  context: E2eTestContext,
  input: {
    doctorId: string;
    adminToken: string;
    doctorStatus?: DoctorStatus;
  },
) {
  return context
    .request()
    .post(`/v1/admin/doctors/${input.doctorId}/doctor-verify`)
    .set('Authorization', `Bearer ${input.adminToken}`)
    .send(buildRethusVerifyPayload(input.doctorStatus))
    .expect(201);
}

export async function createTriageSession(
  context: E2eTestContext,
  token: string,
  specialty: 'GENERAL_MEDICINE' | 'ODONTOLOGY',
) {
  const response = await context
    .request()
    .post('/v1/triage/sessions')
    .set('Authorization', `Bearer ${token}`)
    .send({ specialty })
    .expect(201);

  return response.body as CreateTriageSessionResponseBody;
}

export async function saveTriageAnswers(
  context: E2eTestContext,
  token: string,
  sessionId: string,
  answers: Array<{ questionId: string; answerValue: string | number }>,
) {
  const response = await context
    .request()
    .post(`/v1/triage/sessions/${sessionId}/answers`)
    .set('Authorization', `Bearer ${token}`)
    .send({ answers })
    .expect(200);

  return response.body as SaveTriageAnswersResponseBody;
}

export async function refreshSession(
  context: E2eTestContext,
  refreshToken: string,
) {
  const response = await context
    .request()
    .post('/v1/auth/refresh')
    .send({ refreshToken })
    .expect(200);

  return response.body as AuthSessionResponseBody;
}
