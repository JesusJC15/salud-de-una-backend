import Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  MONGODB_URI: Joi.string().required(),
  AUTH_LEGACY_ENABLED: Joi.boolean().optional(),
  AUTH0_DOMAIN: Joi.string().allow('').optional(),
  AUTH0_AUDIENCE: Joi.string().allow('').optional(),
  AUTH0_ISSUER: Joi.string().allow('').optional(),
  AUTH0_M2M_CLIENT_ID: Joi.string().allow('').optional(),
  AUTH0_M2M_CLIENT_SECRET: Joi.string().allow('').optional(),
  AUTH0_HTTP_TIMEOUT_MS: Joi.number().integer().min(1000).default(5000),
  AUTH0_HTTP_MAX_RETRIES: Joi.number().integer().min(0).max(5).default(2),
  AUTH0_ROLE_ID_PATIENT: Joi.string().allow('').optional(),
  AUTH0_ROLE_ID_DOCTOR: Joi.string().allow('').optional(),
  AUTH0_ROLE_ID_ADMIN: Joi.string().allow('').optional(),
  JWT_SECRET: Joi.string().min(32).optional(),
  JWT_REFRESH_SECRET: Joi.string().min(32).optional(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('1h'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  REFRESH_MAX_ACTIVE_SESSIONS: Joi.number().integer().min(1).default(3),
  CORS_ORIGINS_PATIENT: Joi.string().default(''),
  CORS_ORIGINS_STAFF: Joi.string().default(''),
  ENABLE_BOOTSTRAP_ADMIN: Joi.boolean().default(false),
  BOOTSTRAP_ADMIN_EMAIL: Joi.string().email().optional(),
  BOOTSTRAP_ADMIN_PASSWORD: Joi.string().optional(),
  BOOTSTRAP_ADMIN_FIRST_NAME: Joi.string().optional(),
  BOOTSTRAP_ADMIN_LAST_NAME: Joi.string().optional(),
  REDIS_URL: Joi.string().uri().allow('').optional(),
  REDIS_REQUIRED_IN_PROD: Joi.boolean().default(true),
  REDIS_KEY_PREFIX: Joi.string().optional(),
  EXPO_PUSH_ENDPOINT: Joi.string().uri().optional(),
  EXPO_PUSH_ACCESS_TOKEN: Joi.string().allow('').optional(),
  OUTBOX_DISPATCH_INTERVAL_MS: Joi.number().integer().min(1).optional(),
  AI_ENABLED: Joi.boolean().default(false),
  AI_PROVIDER: Joi.string().valid('gemini').default('gemini'),
  GEMINI_API_KEY: Joi.when('AI_ENABLED', {
    is: true,
    then: Joi.string().trim().min(1).required(),
    otherwise: Joi.string().allow('').optional(),
  }),
  GEMINI_MODEL: Joi.string().allow('').optional(),
  GEMINI_EMBEDDING_MODEL: Joi.string()
    .allow('')
    .default('gemini-embedding-001'),
  RAG_SUMMARY_ENABLED: Joi.boolean().default(false),
  RAG_TRIAGE_ENABLED: Joi.boolean().default(false),
  RAG_PATIENT_EVIDENCE_ENABLED: Joi.boolean().default(false),
  RAG_TOP_K: Joi.number().integer().min(1).max(20).default(8),
  RAG_MAX_CONTEXT_CHUNKS: Joi.number().integer().min(1).max(20).default(10),
  RAG_EMBEDDING_DIMENSIONS: Joi.number()
    .integer()
    .valid(768, 1536, 3072)
    .default(768),
  RAG_VECTOR_INDEX_NAME: Joi.string()
    .allow('')
    .default('salud_de_una_knowledge_chunks_vector_v1'),
  KNOWLEDGE_UPLOAD_MAX_BYTES: Joi.number()
    .integer()
    .min(1024)
    .default(5 * 1024 * 1024),
  KNOWLEDGE_URL_FETCH_TIMEOUT_MS: Joi.number()
    .integer()
    .min(1000)
    .default(10_000),
  KNOWLEDGE_URL_MAX_BYTES: Joi.number()
    .integer()
    .min(1024)
    .default(5 * 1024 * 1024),
  KNOWLEDGE_URL_MAX_REDIRECTS: Joi.number().integer().min(0).max(10).default(3),
  KNOWLEDGE_ALLOWED_MIME_TYPES: Joi.string().default(
    'text/plain,text/html,text/markdown,application/json,text/csv,application/pdf',
  ),
  AUTH0_MIGRATION_KEY: Joi.string().allow('').optional(),
})
  .custom((env, helpers) => {
    const legacyEnabled =
      env.AUTH_LEGACY_ENABLED !== undefined
        ? env.AUTH_LEGACY_ENABLED
        : env.NODE_ENV !== 'production';

    if (legacyEnabled && (!env.JWT_SECRET || !env.JWT_REFRESH_SECRET)) {
      return helpers.error('any.custom', {
        message:
          'JWT_SECRET and JWT_REFRESH_SECRET are required when AUTH_LEGACY_ENABLED is active',
      });
    }

    if (
      env.NODE_ENV === 'production' &&
      env.REDIS_REQUIRED_IN_PROD !== false &&
      !env.REDIS_URL
    ) {
      return helpers.error('any.custom', {
        message: 'REDIS_URL is required in production when REDIS_REQUIRED_IN_PROD is true',
      });
    }

    if (env.ENABLE_BOOTSTRAP_ADMIN === true && !env.BOOTSTRAP_ADMIN_PASSWORD) {
      return helpers.error('any.custom', {
        message:
          'BOOTSTRAP_ADMIN_PASSWORD is required when ENABLE_BOOTSTRAP_ADMIN is true',
      });
    }

    return env;
  })
  .messages({
    'any.custom': '{{#message}}',
  });
