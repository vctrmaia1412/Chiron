import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { applyTestEnv } from './setup/test-database';
import { checkFailClosed, checkSchemaGuard } from '../src/database/verify-rls';

applyTestEnv();

/**
 * A guarda de RLS por tabela vive em src/database/verify-rls.ts e até aqui só
 * rodava quando alguém lembrava de chamá-la à mão. Como teste, ela reprova no
 * mesmo commit a tabela nova que nascer sem família declarada, sem RLS forçado
 * ou sem política.
 *
 * A varredura sai de `platform.rls_policy_registry`, e não de uma lista escrita
 * à mão: lista escrita à mão envelhece e o schema não avisa quando ela ficou
 * para trás.
 */
describe('guarda de schema e falha fechada', () => {
  let owner: Client;
  let app: Client;
  let tenantTables: Array<{ schema: string; name: string }> = [];

  beforeAll(async () => {
    owner = new Client({ connectionString: process.env.DATABASE_MIGRATION_URL });
    await owner.connect();

    const { rows } = await owner.query<{ table_schema: string; table_name: string }>(
      `SELECT table_schema, table_name FROM platform.rls_policy_registry
        WHERE family = 'tenant' ORDER BY table_schema, table_name`,
    );
    tenantTables = rows.map((r) => ({ schema: r.table_schema, name: r.table_name }));

    // Papel da aplicação (chiron_app, sem BYPASSRLS) e nenhum `app.tenant_id`:
    // é o estado exato de uma conexão recém-tirada do pool, antes de qualquer
    // contexto ser aplicado. Se vazar aqui, vaza em produção.
    app = new Client({ connectionString: process.env.DATABASE_URL });
    await app.connect();
  });

  afterAll(async () => {
    await owner?.end();
    await app?.end();
  });

  it('nenhuma tabela fica sem família, sem RLS forçado ou sem política', async () => {
    // Sem argumento, a guarda usa DATABASE_MIGRATION_URL do próprio env, que
    // applyTestEnv já apontou para o banco de teste.
    const problems = await checkSchemaGuard();
    expect(problems.map((p) => `${p.table}: ${p.problem}`)).toEqual([]);
  });

  it('o núcleo clínico não devolve linha alguma sem contexto de tenant', async () => {
    const problems = await checkFailClosed();
    expect(problems.map((p) => `${p.table}: ${p.problem}`)).toEqual([]);
  });

  it('a família tenant vem do registro e acompanha o crescimento do schema', () => {
    const labels = tenantTables.map((t) => `${t.schema}.${t.name}`);
    // O teste de isolamento enumera 11 tabelas à mão; o schema real tem bem mais.
    expect(labels.length).toBeGreaterThan(11);
    expect(labels).toContain('registry.patients');
    expect(labels).toContain('clinical.encounters');
    expect(labels).toContain('billing.charge_items');
    expect(labels).toContain('audit.audit_log');
  });

  it('toda tabela da família tenant devolve zero linhas sem contexto de tenant', async () => {
    const leaked: string[] = [];
    const populated: string[] = [];

    for (const table of tenantTables) {
      const label = `${table.schema}.${table.name}`;
      // Identificadores vêm do registro, preenchido pelas migrações, mas ficam
      // entre aspas para que o nome seja sempre lido como identificador.
      const quoted = `"${table.schema}"."${table.name}"`;

      const seen = await app.query<{ count: string }>(`SELECT count(*)::text AS count FROM ${quoted}`);
      if (seen.rows[0]?.count !== '0') {
        leaked.push(`${label} devolveu ${seen.rows[0]?.count} linhas sem contexto`);
      }

      const real = await owner.query<{ count: string }>(`SELECT count(*)::text AS count FROM ${quoted}`);
      if (real.rows[0]?.count !== '0') populated.push(label);
    }

    expect(leaked).toEqual([]);
    // O zero acima só prova alguma coisa se houver linha para esconder: tabela
    // vazia passaria até sem política nenhuma.
    expect(populated.length, 'o banco de teste veio sem dado suficiente para provar o isolamento').toBeGreaterThan(10);
  });
});
