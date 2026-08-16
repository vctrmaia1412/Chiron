import { Client } from 'pg';
import { config as loadDotenv } from '../../src/config/dotenv';

loadDotenv();

export const TEST_DATABASE = process.env.TEST_DATABASE_NAME ?? 'chiron_test';

function swapDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

function baseUrl(): string {
  const url =
    process.env.DATABASE_MIGRATION_URL ??
    process.env.DATABASE_URL ??
    'postgres://chiron_owner:chiron_dev_password@localhost:5433/chiron';
  return url;
}

export function testUrls() {
  const migration = swapDatabase(baseUrl(), TEST_DATABASE);
  const app = swapDatabase(process.env.DATABASE_URL ?? baseUrl(), TEST_DATABASE);
  const iam = swapDatabase(process.env.DATABASE_IAM_URL ?? process.env.DATABASE_URL ?? baseUrl(), TEST_DATABASE);
  const admin = swapDatabase(process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL ?? baseUrl(), TEST_DATABASE);
  return { migration, app, iam, admin };
}

/**
 * Recria o banco de teste do zero. Os testes de integração rodam contra
 * PostgreSQL real: RLS, triggers e constraints são o objeto do teste, então
 * não faz sentido testar contra um dublê.
 */
export async function recreateTestDatabase(): Promise<void> {
  const adminUrl = swapDatabase(baseUrl(), 'postgres');
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [TEST_DATABASE],
    );
    await client.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE}`);
    await client.query(`CREATE DATABASE ${TEST_DATABASE}`);
  } finally {
    await client.end();
  }
}

export function applyTestEnv(): void {
  const urls = testUrls();
  process.env.APP_ENV = 'test';
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = urls.app;
  process.env.DATABASE_IAM_URL = urls.iam;
  process.env.DATABASE_ADMIN_URL = urls.admin;
  process.env.DATABASE_MIGRATION_URL = urls.migration;
  process.env.LOG_LEVEL = process.env.TEST_LOG_LEVEL ?? 'silent';
  process.env.SESSION_SECRET ??= 'test-session-secret-com-mais-de-32-caracteres';
  process.env.COLUMN_ENCRYPTION_KEY ??= 'test-column-encryption-key-32-chars-min';
  process.env.COLUMN_HASH_KEY ??= 'test-column-hash-key-com-32-caracteres';
  process.env.S3_ACCESS_KEY ??= '';
  process.env.S3_SECRET_KEY ??= '';
}
