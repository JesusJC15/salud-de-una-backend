import Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  APP_RUNTIME_ROLE: Joi.string()
    .trim()
    .lowercase()
    .custom((value: string) =>
      ['all', 'api', 'worker'].includes(value) ? value : 'all',
    )
    .default('all'),
  PORT: Joi.number().default(3000),
  MONGODB_URI: Joi.string().required(),
  AUTH_LEGACY_ENABLED: Joi.boolean().default(true),
  AUTH0_DOMAIN: Joi.string().allow('').optional(),
  AUTH0_AUDIENCE: Joi.string().allow('').optional(),
  AUTH0_ISSUER: Joi.string().allow('').optional(),
  AUTH0_M2M_CLIENT_ID: Joi.string().allow('').optional(),
  AUTH0_M2M_CLIENT_SECRET: Joi.string().allow('').optional(),
  AUTH0_ROLE_ID_PATIENT: Joi.string().allow('').optional(),
  AUTH0_ROLE_ID_DOCTOR: Joi.string().allow('').optional(),
  AUTH0_ROLE_ID_ADMIN: Joi.string().allow('').optional(),
  JWT_SECRET: Joi.when('AUTH_LEGACY_ENABLED', {
    is: true,
    then: Joi.string().min(32).required(),
    otherwise: Joi.string().min(32).optional(),
  }),
  JWT_REFRESH_SECRET: Joi.when('AUTH_LEGACY_ENABLED', {
    is: true,
    then: Joi.string().min(32).required(),
    otherwise: Joi.string().min(32).optional(),
  }),
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
  REDIS_URL: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().uri().required(),
    otherwise: Joi.string().uri().allow('').optional(),
  }),
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
  AI_REQUEST_TIMEOUT_MS: Joi.number()
    .integer()
    .min(1_000)
    .max(120_000)
    .default(20_000),
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
    .min(1_024)
    .default(5 * 1024 * 1024),
  KNOWLEDGE_ALLOWED_MIME_TYPES: Joi.string().default(
    'text/plain,text/markdown,text/csv,application/json,text/html,application/pdf',
  ),
  KNOWLEDGE_URL_ALLOWLIST: Joi.string().allow('').default(''),
  KNOWLEDGE_FETCH_TIMEOUT_MS: Joi.number()
    .integer()
    .min(1_000)
    .max(60_000)
    .default(10_000),
  KNOWLEDGE_MAX_URL_CONTENT_BYTES: Joi.number()
    .integer()
    .min(1_024)
    .default(5 * 1024 * 1024),
  AUTH0_MIGRATION_KEY: Joi.string().allow('').optional(),
  OTEL_ENABLED: Joi.boolean().default(false),
  OTEL_SERVICE_NAME: Joi.string().default('salud-de-una-backend'),
  OTEL_EXPORTER_OTLP_ENDPOINT: Joi.string().uri().allow('').optional(),
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: Joi.string().uri().allow('').optional(),
});
