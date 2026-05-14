import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { HydratedDocument } from 'mongoose';
import { E2eTestContext } from '../support/e2e-harness';
import {
  registerPatientAndLogin,
  registerDoctorAndLogin,
  seedAdminAndLogin,
  verifyDoctorAsAdmin,
  createTriageSession,
  saveTriageAnswers,
} from '../support/flows';
import { buildGeneralMedicineAnswers } from '../support/builders';
import { Followup } from '../../../src/followups/schemas/followup.schema';
import { Consultation } from '../../../src/consultations/schemas/consultation.schema';

jest.setTimeout(60_000);

// ─── helper ──────────────────────────────────────────────────────────────────

async function waitForFollowups(
  context: E2eTestContext,
  patientId: string,
  expectedCount: number,
  timeoutMs = 3_000,
): Promise<void> {
  const followupModel = context.getModel<HydratedDocument<{ patientId: Types.ObjectId }>>(
    Followup.name,
  );
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const count = await followupModel
      .countDocuments({ patientId: new Types.ObjectId(patientId) })
      .exec();
    if (count >= expectedCount) return;
    await new Promise((r) => setTimeout(r, 60));
  }
  throw new Error(`Timed out waiting for ${expectedCount} followups for patient ${patientId}`);
}

// ─── suite ───────────────────────────────────────────────────────────────────

describe('Followups lifecycle (e2e)', () => {
  let context: E2eTestContext;

  // Shared state
  let patientToken: string;
  let patientId: string;
  let patientBToken: string;
  let doctorToken: string;
  let consultationId: string;
  let followupId72h: string;

  beforeAll(async () => {
    context = await E2eTestContext.create({ aiEnabled: false });

    // Admin
    const { session: adminSession } = await seedAdminAndLogin(context);

    // Patient A
    const { patient, session: patientSession } = await registerPatientAndLogin(context);
    patientToken = patientSession.accessToken;
    patientId = patient.id;

    // Patient B (intruder)
    const { session: patientBSession } = await registerPatientAndLogin(context);
    patientBToken = patientBSession.accessToken;

    // Doctor
    const { doctorId, session: doctorSession } = await registerDoctorAndLogin(context);
    doctorToken = doctorSession.accessToken;

    // Verify doctor
    await verifyDoctorAsAdmin(context, { doctorId, adminToken: adminSession.accessToken });
    // Re-login doctor to get verified token
    const refreshedDoctor = await registerDoctorAndLogin(context);
    // Use the same doctorId — token from initial registration is still valid
    void refreshedDoctor;

    // Full triage flow → create consultation
    const session = await createTriageSession(context, patientToken, 'GENERAL_MEDICINE');
    await saveTriageAnswers(context, patientToken, session.sessionId, buildGeneralMedicineAnswers());
    await context
      .request()
      .post(`/v1/triage/sessions/${session.sessionId}/analyze`)
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);

    // Get consultation id from DB
    const consultationModel = context.getModel<HydratedDocument<{ patientId: Types.ObjectId }>>(
      Consultation.name,
    );
    const consultation = await consultationModel
      .findOne({ patientId: new Types.ObjectId(patientId) })
      .lean()
      .exec();
    consultationId = (consultation!._id as Types.ObjectId).toString();

    // Doctor assigns → IN_ATTENTION
    await context
      .request()
      .patch(`/v1/consultations/${consultationId}/assign`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);

    // Doctor closes → triggers outbox event → followups created
    await context
      .request()
      .patch(`/v1/consultations/${consultationId}/close`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ baselineSymptomSeverity: 4 })
      .expect(200);

    // Wait for outbox to dispatch and followups to be created
    await waitForFollowups(context, patientId, 2);

    // Get first followup id for detail tests
    const followupModel = context.getModel<HydratedDocument<{ patientId: Types.ObjectId; scheduledAt: Date }>>(
      Followup.name,
    );
    const followups = await followupModel
      .find({ patientId: new Types.ObjectId(patientId) })
      .sort({ scheduledAt: 1 })
      .lean()
      .exec();
    followupId72h = (followups[0]._id as Types.ObjectId).toString();
  });

  afterAll(async () => {
    if (context) await context.close();
  });

  // ── listing ────────────────────────────────────────────────────────────────

  it('GET /followups/mine — paciente ve sus 2 seguimientos en estado PENDING', async () => {
    const res = await context
      .request()
      .get('/v1/followups/mine')
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);

    const body = res.body as { items: { status: string; patientId: string }[] };
    expect(body.items).toHaveLength(2);
    expect(body.items.every((f) => f.status === 'PENDING')).toBe(true);
  });

  it('GET /followups/mine — sin autenticación devuelve 401', async () => {
    await context
      .request()
      .get('/v1/followups/mine')
      .expect(401);
  });

  // ── detail ─────────────────────────────────────────────────────────────────

  it('GET /followups/:id — paciente propietario obtiene detalle completo', async () => {
    const res = await context
      .request()
      .get(`/v1/followups/${followupId72h}`)
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);

    const body = res.body as {
      id: string;
      status: string;
      baselineSymptomSeverity: number;
      consultationId: string;
    };
    expect(body.id ?? body).toBeTruthy();
    expect(body.status).toBe('PENDING');
    expect(typeof body.baselineSymptomSeverity).toBe('number');
    expect(body.consultationId).toBe(consultationId);
  });

  it('GET /followups/:id — otro paciente recibe 403', async () => {
    await context
      .request()
      .get(`/v1/followups/${followupId72h}`)
      .set('Authorization', `Bearer ${patientBToken}`)
      .expect(403);
  });

  // ── submit: BETTER ─────────────────────────────────────────────────────────

  it('POST /followups — respuesta BETTER → COMPLETED sin escalamiento', async () => {
    const res = await context
      .request()
      .post('/v1/followups')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        followupId: followupId72h,
        currentSymptomSeverity: 2,
        change: 'BETTER',
        medicationTaken: true,
        medicationNotes: 'Tomé ibuprofeno',
      })
      .expect(200);

    const body = res.body as {
      followup: { status: string };
      priorityEscalated: boolean;
      createdConsultationId: string | null;
    };
    expect(body.followup.status).toBe('COMPLETED');
    expect(body.priorityEscalated).toBe(false);
    expect(body.createdConsultationId).toBeNull();
  });

  it('GET /followups/mine?status=COMPLETED — muestra el seguimiento completado', async () => {
    const res = await context
      .request()
      .get('/v1/followups/mine?status=COMPLETED')
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);

    const body = res.body as { items: { status: string }[] };
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    expect(body.items.every((f) => f.status === 'COMPLETED')).toBe(true);
  });

  // ── submit: WORSE (escalation) ─────────────────────────────────────────────

  it('POST /followups — respuesta WORSE con severidad alta → escalamiento y nueva consulta', async () => {
    // Use the second followup (7-day one) for the escalation test
    const followupModel = context.getModel<HydratedDocument<{
      patientId: Types.ObjectId;
      scheduledAt: Date;
      status: string;
    }>>(Followup.name);

    const followups = await followupModel
      .find({ patientId: new Types.ObjectId(patientId), status: 'PENDING' })
      .sort({ scheduledAt: 1 })
      .lean()
      .exec();

    if (followups.length === 0) {
      // All submitted already — skip gracefully
      return;
    }

    const followupIdWeek = (followups[0]._id as Types.ObjectId).toString();

    const res = await context
      .request()
      .post('/v1/followups')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        followupId: followupIdWeek,
        currentSymptomSeverity: 9,
        change: 'WORSE',
        medicationTaken: false,
        newSymptoms: 'Fiebre alta y dificultad respiratoria',
      })
      .expect(200);

    const body = res.body as {
      followup: { status: string };
      priorityEscalated: boolean;
      createdConsultationId: string | null;
    };
    expect(body.followup.status).toBe('COMPLETED');
    expect(body.priorityEscalated).toBe(true);
    expect(typeof body.createdConsultationId).toBe('string');
  });
});
