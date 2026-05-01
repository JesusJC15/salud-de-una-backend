import Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  MONGODB_URI: Joi.string().required(),

  // ── Auth0 (Identity Provider) ──────────────────────────────────────────────
  // Required for production. Optional during the legacy-JWT cutover window.
  // Once Auth0 is fully configured, remove JWT_SECRET and make these required.
  AUTH0_DOMAIN: Joi.string().hostname().optional(),
  AUTH0_AUDIENCE: Joi.string().uri().optional(),
  AUTH0_M2M_CLIENT_ID: Joi.string().optional(),
  AUTH0_M2M_CLIENT_SECRET: Joi.string().optional(),
  AUTH0_ROLE_ID_PATIENT: Joi.string().optional(),
  AUTH0_ROLE_ID_DOCTOR: Joi.string().optional(),
  AUTH0_ROLE_ID_ADMIN: Joi.string().optional(),

  // ── Legacy JWT — deprecated, keep during cutover window ───────────────────
  JWT_SECRET: Joi.string().min(32).optional(),
  JWT_REFRESH_SECRET: Joi.string()
    .min(32)
    .optional()
    .default(Joi.ref('JWT_SECRET')),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('1h'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  // ── Session & CORS ─────────────────────────────────────────────────────────
  REFRESH_MAX_ACTIVE_SESSIONS: Joi.number().integer().min(1).default(3),
  CORS_ORIGINS_PATIENT: Joi.string().default(''),
  CORS_ORIGINS_STAFF: Joi.string().default(''),

  // ── Bootstrap Admin ────────────────────────────────────────────────────────
  // These credentials must come from a secrets manager — never commit them.
  ENABLE_BOOTSTRAP_ADMIN: Joi.boolean().default(false),
  BOOTSTRAP_ADMIN_EMAIL: Joi.when('ENABLE_BOOTSTRAP_ADMIN', {
    is: true,
    then: Joi.string().email().required(),
    otherwise: Joi.string().email().optional(),
  }),
  BOOTSTRAP_ADMIN_PASSWORD: Joi.when('ENABLE_BOOTSTRAP_ADMIN', {
    is: true,
    then: Joi.string().min(8).required(),
    otherwise: Joi.string().optional(),
  }),
  BOOTSTRAP_ADMIN_FIRST_NAME: Joi.when('ENABLE_BOOTSTRAP_ADMIN', {
    is: true,
    then: Joi.string().min(1).required(),
    otherwise: Joi.string().optional(),
  }),
  BOOTSTRAP_ADMIN_LAST_NAME: Joi.when('ENABLE_BOOTSTRAP_ADMIN', {
    is: true,
    then: Joi.string().min(1).required(),
    otherwise: Joi.string().optional(),
  }),

  // ── Infrastructure ─────────────────────────────────────────────────────────
  REDIS_URL: Joi.string().uri().allow('').optional(),
  REDIS_KEY_PREFIX: Joi.string().optional(),
  OUTBOX_DISPATCH_INTERVAL_MS: Joi.number().integer().min(1).optional(),

  // ── AI ─────────────────────────────────────────────────────────────────────
  AI_ENABLED: Joi.boolean().default(false),
  AI_PROVIDER: Joi.string().valid('gemini').default('gemini'),
  GEMINI_API_KEY: Joi.when('AI_ENABLED', {
    is: true,
    then: Joi.string().trim().min(1).required(),
    otherwise: Joi.string().allow('').optional(),
  }),
  GEMINI_MODEL: Joi.string().allow('').optional(),
});
