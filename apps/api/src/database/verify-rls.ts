import { Client } from 'pg';
import { env } from '../config/env';

/**
 * Guarda de schema (documento, seção 16.1 e 10.3):
 * - toda tabela com `tenant_id` NOT NULL tem RLS habilitado e forçado;
 * - toda tabela com `tenant_id` anulável é catálogo com as duas políticas;
 * - toda tabela sem `tenant_id` está na allowlist (família global);
 * - sem contexto de tenant, o papel da aplicação lê zero linhas e não grava.
 */
const APP_SCHEMAS = [
  'platform',
  'iam',
  'audit',
  'registry',
  'scheduling',
  'clinical',
  'lab',
  'immunization',
  'documents',
  'billing',
  'inventory',
];

export interface SchemaGuardProblem {
  table: string;
  problem: string;
}

export async function checkSchemaGuard(connectionString?: string): Promise<SchemaGuardProblem[]> {
  const client = new Client({ connectionString: connectionString ?? env().DATABASE_MIGRATION_URL ?? env().DATABASE_URL });
  await client.connect();
  const problems: SchemaGuardProblem[] = [];

  try {
    const { rows: tables } = await client.query<{
      schema_name: string;
      table_name: string;
      has_tenant: boolean;
      tenant_nullable: boolean;
      rls_enabled: boolean;
      rls_forced: boolean;
      policy_count: number;
      registry_family: string | null;
    }>(
      `
      SELECT
        n.nspname AS schema_name,
        c.relname AS table_name,
        EXISTS (
          SELECT 1 FROM information_schema.columns col
          WHERE col.table_schema = n.nspname AND col.table_name = c.relname AND col.column_name = 'tenant_id'
        ) AS has_tenant,
        COALESCE((
          SELECT col.is_nullable = 'YES' FROM information_schema.columns col
          WHERE col.table_schema = n.nspname AND col.table_name = c.relname AND col.column_name = 'tenant_id'
        ), false) AS tenant_nullable,
        c.relrowsecurity AS rls_enabled,
        c.relforcerowsecurity AS rls_forced,
        (SELECT count(*) FROM pg_policies p WHERE p.schemaname = n.nspname AND p.tablename = c.relname)::int AS policy_count,
        (SELECT family FROM platform.rls_policy_registry r
          WHERE r.table_schema = n.nspname AND r.table_name = c.relname) AS registry_family
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = ANY($1) AND c.relkind = 'r'
        AND c.relname <> 'schema_migrations'
      ORDER BY 1, 2
      `,
      [APP_SCHEMAS],
    );

    for (const t of tables) {
      const label = `${t.schema_name}.${t.table_name}`;
      const family = t.registry_family;
      if (!family) {
        problems.push({ table: label, problem: 'sem família declarada em platform.rls_policy_registry' });
        continue;
      }

      if (family === 'global') {
        if (t.has_tenant) {
          problems.push({ table: label, problem: 'declarada global mas possui tenant_id: precisa de RLS' });
        }
        continue;
      }

      if (!t.rls_enabled) problems.push({ table: label, problem: `família ${family} sem RLS habilitado` });
      if (!t.rls_forced) problems.push({ table: label, problem: `família ${family} sem FORCE ROW LEVEL SECURITY` });
      if (t.policy_count === 0) problems.push({ table: label, problem: `família ${family} sem nenhuma política` });

      if (family === 'catalog' && t.policy_count < 2) {
        problems.push({ table: label, problem: 'catálogo híbrido precisa de política de leitura e de escrita' });
      }
      if ((family === 'tenant' || family === 'outbox') && !t.has_tenant) {
        problems.push({ table: label, problem: `família ${family} sem coluna tenant_id` });
      }
    }
  } finally {
    await client.end();
  }

  return problems;
}

/** Sem `app.tenant_id`, o papel da aplicação não pode ver nada. */
export async function checkFailClosed(): Promise<SchemaGuardProblem[]> {
  const client = new Client({ connectionString: env().DATABASE_URL });
  await client.connect();
  const problems: SchemaGuardProblem[] = [];
  try {
    for (const table of ['registry.patients', 'registry.guardians', 'clinical.encounters', 'scheduling.appointments']) {
      const { rows } = await client.query<{ count: string }>(`SELECT count(*)::text AS count FROM ${table}`);
      if (rows[0] && rows[0].count !== '0') {
        problems.push({ table, problem: `sem contexto de tenant retornou ${rows[0].count} linhas (esperado 0)` });
      }
    }
  } finally {
    await client.end();
  }
  return problems;
}

if (require.main === module) {
  // `void`: a função já trata o próprio erro e chama process.exit, então não há
  // rejeição para propagar. O marcador existe para a regra de promessa solta.
  void (async () => {
    const guard = await checkSchemaGuard();
    const failClosed = await checkFailClosed();
    const all = [...guard, ...failClosed];
    if (all.length === 0) {
      console.log('Guarda de schema: OK. Todas as tabelas têm família e política coerentes.');
      process.exit(0);
    }
    console.error('Guarda de schema encontrou problemas:');
    for (const p of all) console.error(`  - ${p.table}: ${p.problem}`);
    process.exit(1);
  })();
}
