import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { logger } from './logger';
import type { DomainEvent } from './outbox-relay';

/**
 * Reação a eventos de domínio.
 *
 * O que existe aqui é o que o produto realmente faz hoje: notificar a equipe
 * dentro do sistema. Envio de e-mail e WhatsApp não está implementado, então
 * não há handler fingindo que envia: quando existir, entra aqui com o mesmo
 * contrato de evento, sem tocar em quem publica.
 */
type Handler = (client: PoolClient, event: DomainEvent) => Promise<void>;

async function notifyProfessionals(
  client: PoolClient,
  event: DomainEvent,
  input: { kind: string; title: string; body?: string; link?: string; permission: string },
): Promise<void> {
  // Destinatários: membros ativos do tenant com a permissão relevante.
  const { rows } = await client.query<{ user_id: string }>(
    `SELECT DISTINCT m.user_id
       FROM iam.memberships m
       JOIN iam.membership_roles mr ON mr.membership_id = m.id
       JOIN iam.role_permissions rp ON rp.role_id = mr.role_id
      WHERE m.tenant_id = $1 AND m.status = 'active' AND rp.permission_key = $2`,
    [event.tenant_id, input.permission],
  );

  for (const row of rows) {
    await client.query(
      `INSERT INTO platform.notifications
         (id, tenant_id, user_id, kind, title, body, link, related_table, related_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        randomUUID(),
        event.tenant_id,
        row.user_id,
        input.kind,
        input.title,
        input.body ?? null,
        input.link ?? null,
        event.aggregate_table,
        event.aggregate_id,
      ],
    );
  }
}

async function patientName(client: PoolClient, tenantId: string, patientId: string | null): Promise<string> {
  if (!patientId) return 'Paciente';
  const { rows } = await client.query<{ name: string }>(
    `SELECT name FROM registry.patients WHERE id = $1 AND tenant_id = $2`,
    [patientId, tenantId],
  );
  return rows[0]?.name ?? 'Paciente';
}

const HANDLERS: Record<string, Handler> = {
  'exam_result.released': async (client, event) => {
    const patientId = (event.payload.patientId as string) ?? null;
    const name = await patientName(client, event.tenant_id, patientId);
    await notifyProfessionals(client, event, {
      kind: 'exam_result',
      title: 'Resultado de exame disponível',
      body: `${name} teve um resultado liberado.`,
      link: patientId ? `/pacientes/${patientId}` : '/exames',
      permission: 'exam_order:read',
    });
  },

  'encounter.finished': async (client, event) => {
    const followUpDueAt = event.payload.followUpDueAt as string | null | undefined;
    if (!followUpDueAt) return;
    const patientId = (event.payload.patientId as string) ?? null;
    const name = await patientName(client, event.tenant_id, patientId);
    await notifyProfessionals(client, event, {
      kind: 'follow_up',
      title: 'Retorno indicado',
      body: `${name} tem retorno previsto para ${followUpDueAt}.`,
      link: '/agenda?retornos=1',
      permission: 'appointment:create',
    });
  },

  'patient.deceased': async (client, event) => {
    const patientId = (event.payload.patientId as string) ?? event.aggregate_id;
    const name = await patientName(client, event.tenant_id, patientId);
    await notifyProfessionals(client, event, {
      kind: 'patient_deceased',
      title: 'Óbito registrado',
      body: `${name}. Agendamentos futuros foram cancelados e lembretes suspensos.`,
      link: `/pacientes/${patientId}`,
      permission: 'patient:read',
    });
  },
};

export async function handleEvent(client: PoolClient, event: DomainEvent): Promise<void> {
  const handler = HANDLERS[event.event_type];
  if (!handler) {
    // Evento sem reação registrada é entrega concluída, não erro: a outbox
    // guarda o fato para auditoria e integrações futuras.
    logger.debug({ eventType: event.event_type }, 'Evento sem handler, marcado como publicado');
    return;
  }
  await handler(client, event);
}

export const HANDLED_EVENT_TYPES = Object.keys(HANDLERS);
