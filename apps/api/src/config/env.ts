import { z } from 'zod';
import { config as loadDotenv } from './dotenv';

loadDotenv();

/**
 * `z.coerce.boolean()` usa `Boolean(valor)`, e a string "false" é verdadeira.
 * Em variável de ambiente isso liga silenciosamente o que deveria estar
 * desligado, então a leitura é explícita.
 */
const envBoolean = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value.trim() === '') return defaultValue;
      return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
    });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['dev', 'test', 'homolog', 'prod']).default('dev'),
  PORT: z.coerce.number().int().default(3333),
  HOST: z.string().default('0.0.0.0'),

  // Conexões com papéis distintos (seção 9.13 / 10.3 do documento)
  DATABASE_URL: z.string().min(10),
  DATABASE_IAM_URL: z.string().min(10).optional(),
  DATABASE_ADMIN_URL: z.string().min(10).optional(),
  DATABASE_MIGRATION_URL: z.string().min(10).optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().default(10),

  REDIS_URL: z.string().optional(),

  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('chiron'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: envBoolean(true),
  FILES_PUBLIC_HOST: z.string().optional(),

  PUBLIC_APP_URL: z.string().default('http://localhost:3000'),
  API_PREFIX: z.string().default('/api/v1'),

  SESSION_SECRET: z.string().min(32),
  SESSION_TTL_HOURS: z.coerce.number().int().default(12),
  SESSION_ABSOLUTE_DAYS: z.coerce.number().int().default(30),
  STEP_UP_MAX_AGE_MIN: z.coerce.number().int().default(5),
  COOKIE_NAME: z.string().default('chiron_session'),
  COOKIE_SECURE: envBoolean(false),

  COLUMN_ENCRYPTION_KEY: z.string().min(32),
  COLUMN_HASH_KEY: z.string().min(32),

  RATE_LIMIT_LOGIN_PER_MIN: z.coerce.number().int().default(10),
  RATE_LIMIT_PUBLIC_PER_MIN: z.coerce.number().int().default(60),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  SMTP_URL: z.string().optional(),
  EMAIL_FROM: z.string().default('CHIRON <nao-responda@chiron.local>'),

  STORAGE_QUOTA_GB_DEFAULT: z.coerce.number().int().default(10),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuração inválida. Verifique o arquivo .env:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function isProduction(): boolean {
  return env().APP_ENV === 'prod';
}

export function isTest(): boolean {
  return env().APP_ENV === 'test' || process.env.VITEST === 'true';
}
