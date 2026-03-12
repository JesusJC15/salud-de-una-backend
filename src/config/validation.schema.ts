import Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  MONGODB_URI: Joi.string().required(),
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
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
});
