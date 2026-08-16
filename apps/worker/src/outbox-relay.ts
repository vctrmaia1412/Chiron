import type { Pool } from 'pg';
import { logger } from './logger';
import { config } from './config';
import { handleEvent } from './handlers';

export interface DomainEvent {
  id: string;
  tenant_id: string;
  aggregate_table: string;
  aggregate_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  occurred_at: Date;
  attempts: number;
}

/**
 * Relay da outbox.
 *
 * O evento é gravado na mesma transação do fato que o originou, então ou os
 * dois existem ou nenhum existe. Aqui só acontece a entrega, com trava por
 * linha (`FOR UPDATE SKIP LOCKED`) para que várias réplicas do worker possam
 * rodar sem processar o mesmo evento duas vezes.
 *
 * Falha não some: conta tentativa, guarda o erro e, ao passar do limite,
 * marca como morto para inspeção em vez de ficar em laço eterno.
 */
export async function relayOnce(pool: Pool): Promise<{ processed: number; failed: number }> {
  const client = await pool.connect();
  let processed = 0;
  let failed = 0;

  try {
    await client.query('BEGIN');

    const { rows } = await client.query<DomainEvent>(
      `SELECT id, tenant_id, aggregate_table, aggregate_id, event_type, payload, occurred_at, attempts
         FROM platform.domain_events
        WHERE published_at IS NULL AND dead_at IS NULL
        ORDER BY occurred_at
        LIMIT $1
        FOR UPDATE SKIP LOCKED`,
      [config.WORKER_BATCH_SIZE],
    );

    for (const event of rows) {
      try {
        await handleEvent(client, event);
        await client.query(`UPDATE platform.domain_events SET published_at = now() WHERE id = $1`, [event.id]);
        processed += 1;
      } catch (error) {
        failed += 1;
        const attempts = event.attempts + 1;
        const message = error instanceof Error ? error.message : String(error);
        const dead = attempts >= config.WORKER_MAX_ATTEMPTS;

        await client.query(
          `UPDATE platform.domain_events
              SET attempts = $2, last_error = $3, dead_at = CASE WHEN $4 THEN now() ELSE dead_at END
            WHERE id = $1`,
          [event.id, attempts, message.slice(0, 500), dead],
        );

        logger.error(
          { err: error, eventId: event.id, eventType: event.event_type, attempts, dead },
          dead ? 'Evento descartado após esgotar tentativas' : 'Falha ao processar evento',
        );
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  return { processed, failed };
}

export async function countPending(pool: Pool): Promise<{ pending: number; dead: number }> {
  const { rows } = await pool.query<{ pending: string; dead: string }>(
    `SELECT
       count(*) FILTER (WHERE published_at IS NULL AND dead_at IS NULL)::text AS pending,
       count(*) FILTER (WHERE dead_at IS NOT NULL)::text AS dead
     FROM platform.domain_events`,
  );
  return { pending: Number(rows[0]?.pending ?? 0), dead: Number(rows[0]?.dead ?? 0) };
}
