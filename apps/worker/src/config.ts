import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

/** Carrega o .env da raiz do monorepo sem depender de biblioteca externa. */
function loadDotenv(): void {
  for (const candidate of ['.env', '../.env', '../../.env', '../../../.env']) {
    try {
      const content = readFileSync(resolve(process.cwd(), candidate), 'utf8');
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const index = trimmed.indexOf('=');
        if (index === -1) continue;
        const key = trimmed.slice(0, index).trim();
        let value = trimmed.slice(index + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (process.env[key] === undefined) process.env[key] = value;
      }
      return;
    } catch {
      // tenta o próximo caminho
    }
  }
}

loadDotenv();

const schema = z.object({
  APP_ENV: z.enum(['dev', 'test', 'homolog', 'prod']).default('dev'),
  DATABASE_ADMIN_URL: z.string().min(10).optional(),
  DATABASE_URL: z.string().min(10),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  WORKER_POLL_MS: z.coerce.number().int().min(200).default(2000),
  WORKER_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(50),
  WORKER_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(8),
  WORKER_HEALTH_PORT: z.coerce.number().int().default(3334),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
  throw new Error(`Configuração inválida do worker:\n${issues}`);
}

export const config = parsed.data;
export const adminConnectionString = config.DATABASE_ADMIN_URL ?? config.DATABASE_URL;
