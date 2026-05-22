import * as Joi from 'joi';

/**
 * Schema de validação de env vars. Em bootstrap, o ConfigModule
 * valida e interrompe a subida se algo crítico estiver faltando.
 */
export const configValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().default(3001),

  DATABASE_URL: Joi.string().uri().required(),

  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().optional().allow(''),

  JWT_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),

  // Criptografia de secrets (32 bytes = 64 chars hex)
  PROVIDER_ENCRYPTION_KEY: Joi.string().length(64).hex().required(),

  // IA — pelo menos uma das keys deve estar presente dependendo do AI_PROVIDER
  AI_PROVIDER: Joi.string().valid('groq', 'openai').default('groq'),
  AI_MODEL: Joi.string().default('llama-3.3-70b-versatile'),
  GROQ_API_KEY: Joi.string().optional(),
  OPENAI_API_KEY: Joi.string().optional(),

  // URL pública (pra links de proposta)
  PUBLIC_BASE_URL: Joi.string().uri().default('http://localhost:3000'),

  CORS_ORIGIN: Joi.string().default('http://localhost:3000'),

  RATE_LIMIT_TTL: Joi.number().default(60),
  RATE_LIMIT_MAX: Joi.number().default(100),
});
