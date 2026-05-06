import type { ReadinessResponseBody } from '../support/contracts';
import { E2eTestContext } from '../support/e2e-harness';

describe('E2E System / Readiness', () => {
  let context: E2eTestContext;

  beforeAll(async () => {
    context = await E2eTestContext.create();
  });

  afterAll(async () => {
    await context.close();
  });

  it('reports Redis and AI as disabled without failing readiness', async () => {
    const response = await context.request().get('/v1/ready').expect(200);
    const body = response.body as ReadinessResponseBody;

    expect(body.status).toBe('ready');
    expect(body.checks.database.status).toBe('up');
    expect(body.checks.redis.status).toBe('disabled');
    expect(body.checks.ai.status).toBe('disabled');
  });
});
