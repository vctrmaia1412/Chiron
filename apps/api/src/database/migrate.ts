import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { env } from '../config/env';

/**
 * Migrador simples e determinístico:
 * - arquivos `NNNN_nome.sql` aplicados em ordem;
 * - cada migração roda em uma transação;
 * - registro em `platform.schema_migrations` com hash do conteúdo;
 * - hash divergente aborta (a migração aplicada foi editada depois).
 *
 * Roda com o papel dono (DATABASE_MIGRATION_URL), nunca com o papel da API.
 */
export const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations');

export interface MigrationFile {
  name: string;
  sql: string;
  hash: string;
}

export function readMigrations(dir = MIGRATIONS_DIR): MigrationFile[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => {
      const sql = readFileSync(join(dir, name), 'utf8');
      return { name, sql, hash: createHash('sha256').update(sql).digest('hex') };
    });
}

export async function runMigrations(connectionString?: string): Promise<{ applied: string[] }> {
  const url = connectionString ?? env().DATABASE_MIGRATION_URL ?? env().DATABASE_URL;
  const client = new Client({ connectionString: url });
  await client.connect();
  const applied: string[] = [];

  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS platform`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform.schema_migrations (
        name text PRIMARY KEY,
        hash text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await client.query<{ name: string; hash: string }>(
      'SELECT name, hash FROM platform.schema_migrations',
    );
    const appliedByName = new Map(rows.map((r) => [r.name, r.hash]));

    for (const migration of readMigrations()) {
      const previous = appliedByName.get(migration.name);
      if (previous) {
        if (previous !== migration.hash) {
          throw new Error(
            `Migração ${migration.name} já aplicada foi alterada depois. ` +
              'Crie uma nova migração em vez de editar a existente.',
          );
        }
        continue;
      }

      process.stdout.write(`> aplicando ${migration.name} ... `);
      try {
        await client.query('BEGIN');
        await client.query(migration.sql);
        await client.query('INSERT INTO platform.schema_migrations (name, hash) VALUES ($1, $2)', [
          migration.name,
          migration.hash,
        ]);
        await client.query('COMMIT');
        applied.push(migration.name);
        process.stdout.write('ok\n');
      } catch (error) {
        await client.query('ROLLBACK');
        process.stdout.write('falhou\n');
        throw error;
      }
    }
  } finally {
    await client.end();
  }

  return { applied };
}

if (require.main === module) {
  runMigrations()
    .then(async ({ applied }) => {
      if (applied.length === 0) console.log('Nenhuma migração pendente.');
      else console.log(`${applied.length} migração(ões) aplicada(s).`);
      const { syncReferenceData } = await import('./reference-data');
      await syncReferenceData();
      console.log('Dados de referência sincronizados.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Falha na migração:', error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
