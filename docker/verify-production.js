const baseUrl = (process.env.PROD_BASE_URL ?? 'http://localhost:3000').replace(
  /\/+$/u,
  '',
);
const verifyAi = (process.env.VERIFY_AI ?? 'false') === 'true';
const expectRedis = (process.env.EXPECT_REDIS ?? 'true') === 'true';
const adminEmail = process.env.PROD_ADMIN_EMAIL;
const adminPassword = process.env.PROD_ADMIN_PASSWORD;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

async function requestJson(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  const body = await response.text();
  let json;

  try {
    json = body ? JSON.parse(body) : null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(`Invalid JSON from ${path}: ${message}`);
  }

  if (!response.ok) {
    fail(
      `Request to ${path} failed with ${response.status}: ${JSON.stringify(json)}`,
    );
  }

  return json;
}

async function main() {
  process.stdout.write(`Checking ${baseUrl}\n`);

  const health = await requestJson('/v1/health', { method: 'GET' });
  if (health?.status !== 'ok') {
    fail(`Unexpected /v1/health status: ${health?.status ?? 'missing'}`);
  }
  process.stdout.write('Health endpoint OK\n');

  const readiness = await requestJson('/v1/ready', { method: 'GET' });
  if (readiness?.status !== 'ready') {
    fail(`Unexpected /v1/ready status: ${readiness?.status ?? 'missing'}`);
  }
  if (readiness?.checks?.database?.status !== 'up') {
    fail(
      `Unexpected database readiness: ${readiness?.checks?.database?.status ?? 'missing'}`,
    );
  }
  if (expectRedis && readiness?.checks?.redis?.status !== 'up') {
    fail(
      `Unexpected redis readiness: ${readiness?.checks?.redis?.status ?? 'missing'}`,
    );
  }
  process.stdout.write(
    `Readiness OK (redis=${readiness?.checks?.redis?.status ?? 'missing'}, ai=${readiness?.checks?.ai?.status ?? 'missing'})\n`,
  );

  if (!verifyAi) {
    process.stdout.write(
      'Skipping Gemini verification. Set VERIFY_AI=true to validate the admin AI health-check.\n',
    );
    return;
  }

  if (!adminEmail || !adminPassword) {
    fail(
      'PROD_ADMIN_EMAIL and PROD_ADMIN_PASSWORD are required when VERIFY_AI=true',
    );
  }

  const loginResponse = await requestJson('/v1/auth/staff/login', {
    method: 'POST',
    body: JSON.stringify({
      email: adminEmail,
      password: adminPassword,
    }),
  });

  const accessToken = loginResponse?.accessToken;
  const role = loginResponse?.user?.role;

  if (!accessToken) {
    fail('Admin login did not return an access token');
  }
  if (role !== 'ADMIN') {
    fail(`Expected ADMIN role for AI verification, received ${role ?? 'missing'}`);
  }

  const aiResult = await requestJson('/v1/admin/ai/health-check', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({}),
  });

  if (aiResult?.status !== 'up') {
    fail(`Gemini health-check failed: ${JSON.stringify(aiResult)}`);
  }

  process.stdout.write(
    `Gemini OK (${aiResult?.provider ?? 'unknown'} / ${aiResult?.model ?? 'unknown'})\n`,
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  fail(message);
});
