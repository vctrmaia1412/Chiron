import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { applyTestEnv } from './setup/test-database';

applyTestEnv();

/**
 * Teste obrigatório: o tenant A não acessa dado do tenant B.
 *
 * Este arquivo ataca a camada mais baixa, o próprio PostgreSQL, com o papel
 * da aplicação (`chiron_app`, sem BYPASSRLS). Se o RLS falhar aqui, nenhuma
 * verificação em camada superior importa: um `WHERE tenant_id` esquecido em
 * qualquer consulta futura vazaria dado.
 */
describe('isolamento entre organizações no banco', () => {
  let client: Client;
  let tenantA: string;
  let tenantB: string;
  let patientA: string;
  let patientB: string;
  let facilityB: string;
  let speciesId: string;

  beforeAll(async () => {
    const owner = new Client({ connectionString: process.env.DATABASE_MIGRATION_URL });
    await owner.connect();
    const tenants = await owner.query<{ id: string; slug: string }>(
      `SELECT id, slug FROM platform.tenants WHERE slug IN ('demo','beta')`,
    );
    tenantA = tenants.rows.find((t) => t.slug === 'demo')!.id;
    tenantB = tenants.rows.find((t) => t.slug === 'beta')!.id;

    const patients = await owner.query<{ id: string; tenant_id: string }>(
      `SELECT id, tenant_id FROM registry.patients WHERE tenant_id IN ($1,$2) ORDER BY tenant_id, number`,
      [tenantA, tenantB],
    );
    patientA = patients.rows.find((p) => p.tenant_id === tenantA)!.id;
    patientB = patients.rows.find((p) => p.tenant_id === tenantB)!.id;

    const facility = await owner.query<{ id: string }>(
      `SELECT id FROM platform.facilities WHERE tenant_id = $1 LIMIT 1`,
      [tenantB],
    );
    facilityB = facility.rows[0]!.id;

    const species = await owner.query<{ id: string }>(`SELECT id FROM registry.species WHERE code = 'dog'`);
    speciesId = species.rows[0]!.id;

    await owner.end();

    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  async function asTenant<T>(tenantId: string | null, fn: () => Promise<T>): Promise<T> {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId ?? '']);
    try {
      return await fn();
    } finally {
      await client.query('ROLLBACK');
    }
  }

  it('sem contexto de tenant, a aplicação lê zero linhas', async () => {
    await asTenant(null, async () => {
      for (const table of [
        'registry.patients',
        'registry.guardians',
        'clinical.encounters',
        'clinical.encounter_notes',
        'clinical.observations',
        'clinical.prescriptions',
        'scheduling.appointments',
        'lab.exam_orders',
        'immunization.immunizations',
        'documents.documents',
        'audit.audit_log',
      ]) {
        const { rows } = await client.query<{ count: string }>(`SELECT count(*)::text AS count FROM ${table}`);
        expect(rows[0]?.count, `${table} deveria estar vazia sem contexto`).toBe('0');
      }
    });
  });

  it('o tenant A não enxerga pacientes do tenant B', async () => {
    await asTenant(tenantA, async () => {
      const total = await client.query<{ count: string }>(`SELECT count(*)::text AS count FROM registry.patients`);
      expect(Number(total.rows[0]?.count)).toBeGreaterThan(0);

      const cross = await client.query(`SELECT id FROM registry.patients WHERE id = $1`, [patientB]);
      expect(cross.rowCount).toBe(0);

      const own = await client.query(`SELECT id FROM registry.patients WHERE id = $1`, [patientA]);
      expect(own.rowCount).toBe(1);
    });
  });

  it('o tenant B não enxerga pacientes do tenant A', async () => {
    await asTenant(tenantB, async () => {
      const cross = await client.query(`SELECT id FROM registry.patients WHERE id = $1`, [patientA]);
      expect(cross.rowCount).toBe(0);
    });
  });

  it('consulta sem filtro de tenant continua isolada', async () => {
    // Simula o esquecimento clássico: SELECT sem WHERE tenant_id.
    const [countA, countB] = [
      await asTenant(tenantA, async () => {
        const { rows } = await client.query<{ count: string }>(`SELECT count(*)::text AS count FROM registry.patients`);
        return Number(rows[0]?.count);
      }),
      await asTenant(tenantB, async () => {
        const { rows } = await client.query<{ count: string }>(`SELECT count(*)::text AS count FROM registry.patients`);
        return Number(rows[0]?.count);
      }),
    ];

    const total = await (async () => {
      const owner = new Client({ connectionString: process.env.DATABASE_MIGRATION_URL });
      await owner.connect();
      const { rows } = await owner.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM registry.patients WHERE tenant_id IN ($1,$2)`,
        [tenantA, tenantB],
      );
      await owner.end();
      return Number(rows[0]?.count);
    })();

    expect(countA).toBeGreaterThan(0);
    expect(countB).toBeGreaterThan(0);
    expect(countA + countB).toBe(total);
  });

  it('o isolamento vale para todo o núcleo clínico, não só para pacientes', async () => {
    const tables = [
      'clinical.encounters',
      'clinical.encounter_notes',
      'clinical.observations',
      'clinical.prescriptions',
      'scheduling.appointments',
      'lab.exam_orders',
      'immunization.immunizations',
    ];

    await asTenant(tenantB, async () => {
      for (const table of tables) {
        const { rows } = await client.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM ${table} WHERE tenant_id = $1`,
          [tenantA],
        );
        expect(rows[0]?.count, `${table} vazou linha do outro tenant`).toBe('0');
      }
    });
  });

  it('gravar com tenant_id de outra organização é recusado pelo banco', async () => {
    await expect(
      asTenant(tenantB, async () => {
        await client.query(
          `INSERT INTO registry.guardians (tenant_id, number, name, document_kind)
           VALUES ($1, 999999, 'Invasor', 'none')`,
          [tenantA],
        );
      }),
    ).rejects.toThrow();
  });

  it('referenciar registro de outra organização é recusado pela chave composta', async () => {
    await expect(
      asTenant(tenantB, async () => {
        await client.query(
          `INSERT INTO clinical.encounters
             (tenant_id, facility_id, number, patient_id, class, status)
           VALUES ($1, $2, 999999, $3, 'outpatient', 'arrived')`,
          [tenantB, facilityB, patientA],
        );
      }),
    ).rejects.toThrow();
  });

  it('atualizar linha de outra organização não afeta nenhuma linha', async () => {
    await asTenant(tenantB, async () => {
      const result = await client.query(`UPDATE registry.patients SET name = 'Invadido' WHERE id = $1`, [patientA]);
      expect(result.rowCount).toBe(0);
    });

    const owner = new Client({ connectionString: process.env.DATABASE_MIGRATION_URL });
    await owner.connect();
    const { rows } = await owner.query<{ name: string }>(`SELECT name FROM registry.patients WHERE id = $1`, [
      patientA,
    ]);
    await owner.end();
    expect(rows[0]?.name).not.toBe('Invadido');
  });

  it('apagar linha de outra organização não afeta nenhuma linha', async () => {
    await asTenant(tenantB, async () => {
      const result = await client.query(`DELETE FROM registry.patients WHERE id = $1`, [patientA]);
      expect(result.rowCount).toBe(0);
    });
  });

  it('inserir sem tenant_id herda o tenant do contexto, nunca outro', async () => {
    await asTenant(tenantB, async () => {
      const { rows } = await client.query<{ tenant_id: string }>(
        `INSERT INTO registry.patients (number, name, species_id, origin_facility_id)
         VALUES (999999, 'Paciente do contexto', $1, $2)
         RETURNING tenant_id`,
        [speciesId, facilityB],
      );
      expect(rows[0]?.tenant_id).toBe(tenantB);
    });
  });

  it('o papel da aplicação não consegue desligar o RLS', async () => {
    await expect(client.query(`ALTER TABLE registry.patients DISABLE ROW LEVEL SECURITY`)).rejects.toThrow();
  });

  it('o papel da aplicação não consegue apagar registro de auditoria', async () => {
    await asTenant(tenantA, async () => {
      await expect(client.query(`DELETE FROM audit.audit_log WHERE tenant_id = $1`, [tenantA])).rejects.toThrow();
    });
  });
});
