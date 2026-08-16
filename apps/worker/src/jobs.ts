import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { logger } from './logger';

/**
 * Tarefas periódicas que não nascem de um evento e sim da passagem do tempo.
 * Todas são idempotentes: rodar duas vezes no mesmo dia não duplica nada,
 * porque a existência do aviso é verificada antes de gravar.
 */

/** Vacinas e preventivos que vencem nos próximos dias viram aviso interno. */
export async function notifyDueImmunizations(pool: Pool): Promise<number> {
  const { rows } = await pool.query<{
    tenant_id: string;
    patient_id: string;
    patient_name: string;
    product_name: string;
    due_at: Date;
  }>(
    `SELECT i.tenant_id, i.patient_id, p.name AS patient_name, i.vaccine_name AS product_name, i.next_due_at AS due_at
       FROM immunization.immunizations i
       JOIN registry.patients p ON p.id = i.patient_id AND p.tenant_id = i.tenant_id
      WHERE i.status = 'completed'
        AND i.next_due_at IS NOT NULL
        AND i.next_due_at BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
        AND p.status = 'active' AND p.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM immunization.immunizations later
           WHERE later.tenant_id = i.tenant_id AND later.patient_id = i.patient_id
             AND later.vaccine_name = i.vaccine_name AND later.status = 'completed'
             AND later.administered_at > i.administered_at)
      LIMIT 500`,
  );

  let created = 0;
  for (const row of rows) {
    const kind = 'immunization_due';
    const relatedId = row.patient_id;

    const { rows: recipients } = await pool.query<{ user_id: string }>(
      `SELECT DISTINCT m.user_id
         FROM iam.memberships m
         JOIN iam.membership_roles mr ON mr.membership_id = m.id
         JOIN iam.role_permissions rp ON rp.role_id = mr.role_id
        WHERE m.tenant_id = $1 AND m.status = 'active' AND rp.permission_key = 'immunization:read'`,
      [row.tenant_id],
    );

    for (const recipient of recipients) {
      const { rowCount } = await pool.query(
        `SELECT 1 FROM platform.notifications
          WHERE tenant_id = $1 AND user_id = $2 AND kind = $3 AND related_id = $4
            AND created_at > now() - INTERVAL '7 days'
          LIMIT 1`,
        [row.tenant_id, recipient.user_id, kind, relatedId],
      );
      if (rowCount) continue;

      await pool.query(
        `INSERT INTO platform.notifications
           (id, tenant_id, user_id, kind, title, body, link, related_table, related_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'registry.patients',$8)`,
        [
          randomUUID(),
          row.tenant_id,
          recipient.user_id,
          kind,
          'Vacina a vencer',
          `${row.patient_name}: ${row.product_name} prevista para ${row.due_at.toISOString().slice(0, 10)}.`,
          '/vacinas',
          relatedId,
        ],
      );
      created += 1;
    }
  }

  return created;
}

/** Sessões expiradas há mais de trinta dias saem da tabela. */
export async function purgeExpiredSessions(pool: Pool): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM iam.sessions
      WHERE (expires_at < now() - INTERVAL '30 days')
         OR (revoked_at IS NOT NULL AND revoked_at < now() - INTERVAL '30 days')`,
  );
  return rowCount ?? 0;
}

/** Convites e tokens de redefinição vencidos deixam de existir. */
export async function purgeExpiredTokens(pool: Pool): Promise<number> {
  const invitations = await pool.query(
    `DELETE FROM iam.invitations WHERE expires_at < now() - INTERVAL '7 days' AND accepted_at IS NULL`,
  );
  const resets = await pool.query(
    `DELETE FROM iam.password_reset_tokens WHERE expires_at < now() - INTERVAL '7 days'`,
  );
  return (invitations.rowCount ?? 0) + (resets.rowCount ?? 0);
}

/** Documento registrado mas nunca enviado não pode ficar ocupando lugar. */
export async function purgeAbandonedUploads(pool: Pool): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM documents.documents
      WHERE status = 'pending_upload' AND created_at < now() - INTERVAL '1 day'`,
  );
  return rowCount ?? 0;
}

export interface ScheduledJob {
  name: string;
  intervalMs: number;
  run: (pool: Pool) => Promise<number>;
  describe: (count: number) => string;
}

const HOUR = 60 * 60 * 1000;

export const SCHEDULED_JOBS: ScheduledJob[] = [
  {
    name: 'immunizations-due',
    intervalMs: 6 * HOUR,
    run: notifyDueImmunizations,
    describe: (count) => `${count} avisos de vacina criados`,
  },
  {
    name: 'purge-sessions',
    intervalMs: 12 * HOUR,
    run: purgeExpiredSessions,
    describe: (count) => `${count} sessões expiradas removidas`,
  },
  {
    name: 'purge-tokens',
    intervalMs: 12 * HOUR,
    run: purgeExpiredTokens,
    describe: (count) => `${count} tokens vencidos removidos`,
  },
  {
    name: 'purge-uploads',
    intervalMs: 12 * HOUR,
    run: purgeAbandonedUploads,
    describe: (count) => `${count} uploads abandonados removidos`,
  },
];

export async function runJob(pool: Pool, job: ScheduledJob): Promise<void> {
  const startedAt = Date.now();
  try {
    const count = await job.run(pool);
    logger.info({ job: job.name, ms: Date.now() - startedAt }, job.describe(count));
  } catch (error) {
    logger.error({ err: error, job: job.name }, 'Falha na tarefa periódica');
  }
}
