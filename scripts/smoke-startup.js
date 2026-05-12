'use strict';

const http = require('node:http');
const { spawn } = require('node:child_process');
const path = require('node:path');

const port = Number(process.env.PORT || 3100);
const startupTimeoutMs = Number(process.env.SMOKE_STARTUP_TIMEOUT_MS || 45000);
const shutdownGraceMs = Number(process.env.SMOKE_SHUTDOWN_GRACE_MS || 5000);
const appPath = path.join(__dirname, '..', 'dist', 'main.js');

function fail(message, logs = []) {
  if (logs.length > 0) {
    process.stderr.write(`Captured logs:\n${logs.join('')}\n`);
  }
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function probeReady() {
  return new Promise((resolve, reject) => {
    const request = http.get(
      `http://127.0.0.1:${port}/v1/ready`,
      { timeout: 3000 },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          if (response.statusCode !== 200) {
            reject(
              new Error(`Unexpected readiness status code ${response.statusCode}`),
            );
            return;
          }

          try {
            const payload = JSON.parse(body);
            if (payload?.status !== 'ready') {
              reject(
                new Error(
                  `Unexpected readiness payload status ${payload?.status ?? 'missing'}`,
                ),
              );
              return;
            }

            resolve(payload);
          } catch (error) {
            reject(error);
          }
        });
      },
    );

    request.on('timeout', () => {
      request.destroy(new Error('Readiness probe timed out'));
    });
    request.on('error', reject);
  });
}

async function main() {
  const env = {
    ...process.env,
    PORT: String(port),
    APP_RUNTIME_ROLE: process.env.APP_RUNTIME_ROLE || 'api',
  };
  const logs = [];
  const child = spawn(process.execPath, [appPath], {
    cwd: path.join(__dirname, '..'),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => logs.push(chunk.toString()));
  child.stderr.on('data', (chunk) => logs.push(chunk.toString()));
  child.on('exit', (code, signal) => {
    if (code !== null && code !== 0) {
      fail(`Smoke startup process exited early with code ${code}`, logs);
    }
    if (signal && signal !== 'SIGTERM') {
      fail(`Smoke startup process exited with signal ${signal}`, logs);
    }
  });

  const deadline = Date.now() + startupTimeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      await probeReady();
      child.kill('SIGTERM');
      await wait(shutdownGraceMs);
      process.stdout.write(`Startup smoke OK on port ${port}\n`);
      return;
    } catch (error) {
      lastError = error;
      await wait(1000);
    }
  }

  child.kill('SIGTERM');
  fail(
    `Startup smoke timed out: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    logs,
  );
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
