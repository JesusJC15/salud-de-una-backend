import type { AiHealthCheckResponseBody } from '../support/contracts';
import { E2eTestContext } from '../support/e2e-harness';
import { seedAdminAndLogin } from '../support/flows';

describe('E2E Clinical AI / Admin Health Check', () => {
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

  it('reports disabled AI when runtime configuration is absent', async () => {
    const { session } = await seedAdminAndLogin(context, {
      email: 'admin@example.com',
      password: 'AdminP@ss1',
    });

    const response = await context
      .request()
      .post('/v1/admin/ai/health-check')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(201);

    const body = response.body as AiHealthCheckResponseBody;
    expect(body).toMatchObject({
      provider: 'gemini',
      status: 'disabled',
      degraded: true,
    });
    expect(typeof body.requestId).toBe('string');
  });
});
