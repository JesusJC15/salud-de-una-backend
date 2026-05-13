'use strict';

const fs = require('node:fs');
const path = require('node:path');

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function main() {
  loadEnvFileIfPresent(path.join(__dirname, '..', '.env'));

  const schemaModulePath = path.join(
    __dirname,
    '..',
    'dist',
    'config',
    'validation.schema.js',
  );
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { validationSchema } = require(schemaModulePath);
  const { error, value } = validationSchema.validate(process.env, {
    abortEarly: true,
    allowUnknown: true,
  });

  if (error) {
    fail(`Environment validation failed: ${error.message}`);
  }

  process.stdout.write(
    `Environment validation OK for NODE_ENV=${value.NODE_ENV} APP_RUNTIME_ROLE=${value.APP_RUNTIME_ROLE}\n`,
  );
}

function loadEnvFileIfPresent(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/u);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = rawValue;
    }
  }
}

main();
