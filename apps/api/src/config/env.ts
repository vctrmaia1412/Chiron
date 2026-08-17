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

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['dev', 'test', 'homolog', 'prod']).default('dev'),
  PORT: z.coerce.number().int().default(3333),
  HOST: z.string().default('0.0.0.0'),

  // Conexões com papéis distintos (seção 9.13 / 10.3 do documento)
  DATABASE_URL: z.string().min(10),
  DATABASE_IAM_URL: z.string().min(10).optional(),
  DATABASE_ADMIN_URL: z.string().min(10).optional(),
  DATABASE_MIGRATION_URL: z.string().min(10).optional(),
  /** Senha dos papéis chiron_app, chiron_iam e chiron_admin, aplicada na migração. */
  DATABASE_ROLE_PASSWORD: z.string().min(8).optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().default(10),

  /** Declarada e ainda não lida: entra na etapa de fila e cache (worker assíncrono). */
  REDIS_URL: z.string().optional(),

  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('chiron'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: envBoolean(true),
  /**
   * Endpoint que o navegador enxerga. A assinatura SigV4 cobre o host, então a
   * URL precisa ser assinada já com o endereço público: trocar o host depois
   * invalida a assinatura. Use `publicStorageEndpoint()` para ler com fallback.
   */
  S3_PUBLIC_ENDPOINT: z.string().optional(),
  /** Nome antigo de S3_PUBLIC_ENDPOINT, mantido para não quebrar .env existentes. */
  FILES_PUBLIC_HOST: z.string().optional(),

  PUBLIC_APP_URL: z.string().default('http://localhost:3000'),
  /** Origens extras permitidas, separadas por vírgula (proxy, domínio alternativo). */
  EXTRA_ALLOWED_ORIGINS: z.string().default(''),
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

  /**
   * Envio de e-mail por API HTTP (convite e redefinição de senha). Com `none`,
   * ou sem chave, o mailer entra em modo seco e registra o link no log: serve
   * em desenvolvimento e é recusado em produção.
   */
  EMAIL_PROVIDER: z.enum(['resend', 'none']).default('none'),
  EMAIL_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('CHIRON <nao-responda@chiron.local>'),
  /**
   * Reservada: só valeria com saída SMTP liberada, que a Oracle Cloud e boa
   * parte dos PaaS bloqueiam por padrão. O envio usa a API HTTP do provedor.
   */
  SMTP_URL: z.string().optional(),

  /** Declarada e ainda não lida: entra na etapa de cota de armazenamento por organização. */
  STORAGE_QUOTA_GB_DEFAULT: z.coerce.number().int().default(10),
});

/** Hostnames que nunca valem como endereço público da aplicação. */
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);

/**
 * Invariantes de produção. A pilha em contêiner herda o `.env` de
 * desenvolvimento, então subir com segredo de exemplo, cookie sem Secure ou
 * `APP_ENV=dev` (que libera CORS para localhost e grava token de redefinição no
 * log) é um acidente fácil. Melhor não subir do que subir aberto.
 */
const envSchema = baseEnvSchema.superRefine((cfg, ctx) => {
  if (cfg.NODE_ENV === 'production' && cfg.APP_ENV === 'dev') {
    ctx.addIssue({
      code: 'custom',
      path: ['APP_ENV'],
      message:
        'NODE_ENV=production com APP_ENV=dev libera CORS para localhost e escreve o token de redefinição no log. Defina APP_ENV=prod ou APP_ENV=homolog.',
    });
  }

  if (cfg.APP_ENV !== 'prod') return;

  if (!cfg.COOKIE_SECURE) {
    ctx.addIssue({
      code: 'custom',
      path: ['COOKIE_SECURE'],
      message: 'Defina COOKIE_SECURE=true: sem Secure o cookie de sessão trafega fora do HTTPS.',
    });
  }

  let publicUrl: URL | null = null;
  try {
    publicUrl = new URL(cfg.PUBLIC_APP_URL);
  } catch {
    publicUrl = null;
  }
  if (!publicUrl || publicUrl.protocol !== 'https:' || LOCAL_HOSTNAMES.has(publicUrl.hostname)) {
    ctx.addIssue({
      code: 'custom',
      path: ['PUBLIC_APP_URL'],
      message: 'PUBLIC_APP_URL precisa ser a URL https pública da aplicação, não localhost.',
    });
  }

  if (!cfg.S3_ACCESS_KEY || !cfg.S3_SECRET_KEY) {
    ctx.addIssue({
      code: 'custom',
      path: ['S3_ACCESS_KEY'],
      message:
        'Defina S3_ACCESS_KEY e S3_SECRET_KEY: sem storage, upload de documento e emissão de PDF ficam indisponíveis.',
    });
  }

  if (cfg.EMAIL_PROVIDER !== 'none' && (!cfg.EMAIL_API_KEY || cfg.EMAIL_FROM.includes('chiron.local'))) {
    ctx.addIssue({
      code: 'custom',
      path: ['EMAIL_API_KEY'],
      message:
        'Com EMAIL_PROVIDER definido, preencha EMAIL_API_KEY e EMAIL_FROM com o remetente do domínio verificado: sem eles o convite e a redefinição de senha não chegam a ninguém.',
    });
  }

  if (!cfg.DATABASE_IAM_URL || !cfg.DATABASE_ADMIN_URL) {
    ctx.addIssue({
      code: 'custom',
      path: ['DATABASE_IAM_URL'],
      message:
        'Defina DATABASE_IAM_URL e DATABASE_ADMIN_URL: sem os papéis separados a aplicação acessa o banco com privilégio a mais.',
    });
  }

  // Valores herdados do .env.example: qualquer instalação conhece esses segredos.
  const secrets: ReadonlyArray<readonly [string, string | undefined]> = [
    ['SESSION_SECRET', cfg.SESSION_SECRET],
    ['COLUMN_ENCRYPTION_KEY', cfg.COLUMN_ENCRYPTION_KEY],
    ['COLUMN_HASH_KEY', cfg.COLUMN_HASH_KEY],
    ['DATABASE_ROLE_PASSWORD', cfg.DATABASE_ROLE_PASSWORD],
    ['S3_ACCESS_KEY', cfg.S3_ACCESS_KEY],
    ['S3_SECRET_KEY', cfg.S3_SECRET_KEY],
  ];
  for (const [name, value] of secrets) {
    if (value === undefined) continue;
    if (value.includes('change_me') || value.startsWith('dev_')) {
      ctx.addIssue({
        code: 'custom',
        path: [name],
        message: `${name} ainda usa o valor de exemplo do .env.example. Gere um segredo novo, por exemplo com openssl rand -base64 48.`,
      });
    }
  }
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

/**
 * Endpoint usado para assinar URL que o navegador vai abrir. Dentro de contêiner
 * o endpoint interno não resolve fora da rede do compose, e a assinatura cobre o
 * host: por isso a URL já sai assinada com o endereço público.
 */
export function publicStorageEndpoint(): string | undefined {
  const cfg = env();
  return cfg.S3_PUBLIC_ENDPOINT ?? cfg.FILES_PUBLIC_HOST ?? cfg.S3_ENDPOINT;
}

export function isProduction(): boolean {
  return env().APP_ENV === 'prod';
}

export function isTest(): boolean {
  return env().APP_ENV === 'test' || process.env.VITEST === 'true';
}
