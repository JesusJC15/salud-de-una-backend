'use strict';

const { spawnSync } = require('node:child_process');

const allowedRoles = new Set(['all', 'api', 'worker']);
const runtimeRole = allowedRoles.has(process.env.APP_RUNTIME_ROLE ?? '')
  ? process.env.APP_RUNTIME_ROLE
  : 'all';

const result = spawnSync(
  process.execPath,
  [require.resolve('jest/bin/jest'), ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      APP_RUNTIME_ROLE: runtimeRole,
    },
  },
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
