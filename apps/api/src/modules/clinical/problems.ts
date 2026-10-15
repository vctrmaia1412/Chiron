import type { PoolClient } from 'pg';
import type { PatientProblem } from '@chiron/contracts';
import { uuidv7 } from '../../common/uuid';

export interface ProblemRow {
  id: string;
  patient_id: string;
  condition_id: string | null;
  description: string;
  status: string;
  onset_at: Date | null;
  resolved_at: Date | null;
  source_encounter_id: string | null;
  created_at: Date;
}

export const PROBLEM_SELECT = `id, patient_id, condition_id, description, status, onset_at, resolved_at,
  source_encounter_id, created_at`;

export function toProblem(row: ProblemRow): PatientProblem {
  return {
    id: row.id,
    patientId: row.patient_id,
    conditionId: row.condition_id,
    description: row.description,
    status: row.status as PatientProblem['status'],
    onsetAt: row.onset_at?.toISOString() ?? null,
    resolvedAt: row.resolved_at?.toISOString() ?? null,
    sourceEncounterId: row.source_encounter_id,
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * Problema em aberto com a mesma descrição não é duplicado: o mesmo
 * diagnóstico registrado em três retornos continua sendo um problema só. Se o
 * pedido muda a situação (ativo para crônico), a linha existente é atualizada.
 */
export async function upsertProblemInTx(
  tx: PoolClient,
  tenantId: string,
  patientId: string,
  input: { description: string; status: 'active' | 'chronic' | 'resolved'; conditionId?: string | null; sourceEncounterId?: string | null },
): Promise<{ id: string; created: boolean }> {
  const existing = await tx.query<{ id: string; status: string }>(
    `SELECT id, status FROM registry.patient_problems
      WHERE tenant_id = $1 AND patient_id = $2 AND status IN ('active','chronic')
        AND (lower(description) = lower($3) OR ($4::uuid IS NOT NULL AND condition_id = $4))
      LIMIT 1
      FOR UPDATE`,
    [tenantId, patientId, input.description, input.conditionId ?? null],
  );
  const found = existing.rows[0];
  if (found) {
    if (found.status !== input.status) {
      await tx.query(
        `UPDATE registry.patient_problems
            SET status = $3, resolved_at = CASE WHEN $3 = 'resolved' THEN now() ELSE NULL END
          WHERE id = $1 AND tenant_id = $2`,
        [found.id, tenantId, input.status],
      );
    }
    return { id: found.id, created: false };
  }

  const id = uuidv7();
  await tx.query(
    `INSERT INTO registry.patient_problems
       (id, tenant_id, patient_id, condition_id, description, status, onset_at, resolved_at, source_encounter_id)
     VALUES ($1,$2,$3,$4,$5,$6, now(), CASE WHEN $6 = 'resolved' THEN now() ELSE NULL END, $7)`,
    [id, tenantId, patientId, input.conditionId ?? null, input.description, input.status, input.sourceEncounterId ?? null],
  );
  return { id, created: true };
}
