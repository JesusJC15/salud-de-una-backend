if (!['all', 'api', 'worker'].includes(process.env.APP_RUNTIME_ROLE ?? '')) {
  process.env.APP_RUNTIME_ROLE = 'all';
}
