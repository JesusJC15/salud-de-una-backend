const http = require('node:http');

const port = process.env.PORT ?? '3000';
const expectedStatus = process.env.HEALTHCHECK_EXPECTED_STATUS ?? 'ready';
const expectRedisUp =
  (process.env.HEALTHCHECK_EXPECT_REDIS ??
    (process.env.REDIS_URL ? 'true' : 'false')) === 'true';
const url =
  process.env.HEALTHCHECK_URL ?? `http://127.0.0.1:${port}/v1/ready`;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const request = http.get(url, { timeout: 4000 }, (response) => {
  let body = '';

  response.setEncoding('utf8');
  response.on('data', (chunk) => {
    body += chunk;
  });

  response.on('end', () => {
    if (response.statusCode !== 200) {
      fail(`Unexpected status code: ${response.statusCode ?? 'unknown'}`);
      return;
    }

    try {
      const payload = JSON.parse(body);
      if (payload?.status !== expectedStatus) {
        fail(`Unexpected readiness status: ${payload?.status ?? 'missing'}`);
        return;
      }
      if (payload?.checks?.database?.status !== 'up') {
        fail(
          `Unexpected database readiness: ${payload?.checks?.database?.status ?? 'missing'}`,
        );
        return;
      }
      if (expectRedisUp && payload?.checks?.redis?.status !== 'up') {
        fail(
          `Unexpected redis readiness: ${payload?.checks?.redis?.status ?? 'missing'}`,
        );
        return;
      }
      process.exit(0);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      fail(`Invalid readiness response: ${message}`);
    }
  });
});

request.on('timeout', () => {
  request.destroy(new Error('Healthcheck request timed out'));
});

request.on('error', (error) => {
  fail(error.message);
});
