import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { AuditCategory } from '@chiron/contracts';
import type { RequestContext } from './request-context';
import { uuidv7 } from './uuid';

export interface AuditInput {
  category: AuditCategory;
  action: string;
  entitySchema?: string;
  entityTable?: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  facilityId?: string | null;
}

export interface AccessLogInput {
  resource: 'encounter' | 'record' | 'timeline' | 'document' | 'invoice' | 'export' | 'search';
  resourceId?: string | null;
  patientId?: string | null;
  purpose?: string | null;
}

/**
 * Auditoria gravada pela aplicação, na mesma transação do caso de uso
 * (documento, seção 9.1). O trigger de banco apenas impede UPDATE/DELETE.
 *
 * `before`/`after` nunca carregam dado pessoal em claro: os casos de uso
 * passam apenas ids e campos não identificadores.
 */
@Injectable()
export class AuditService {
  async record(tx: PoolClient, ctx: RequestContext, input: AuditInput): Promise<void> {
    await tx.query(
      `INSERT INTO audit.audit_log
         (id, tenant_id, facility_id, actor_user_id, actor_membership_id, actor_type, on_behalf_of,
          category, action, entity_schema, entity_table, entity_id, before, after, reason,
          request_id, ip, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [
        uuidv7(),
        ctx.tenantId,
        input.facilityId ?? ctx.facilityId,
        ctx.user.id,
        ctx.membershipId,
        ctx.principalType === 'platform_staff' ? 'platform_staff' : 'user',
        ctx.onBehalfOf,
        input.category,
        input.action,
        input.entitySchema ?? null,
        input.entityTable ?? null,
        input.entityId ?? null,
        input.before ? JSON.stringify(input.before) : null,
        input.after ? JSON.stringify(input.after) : null,
        input.reason ?? null,
        ctx.requestId,
        ctx.ip,
        ctx.userAgent,
      ],
    );
  }

  /** Leitura de dado sensível (prontuário, timeline, documento, exportação). */
  async recordAccess(tx: PoolClient, ctx: RequestContext, input: AccessLogInput): Promise<void> {
    await tx.query(
      `INSERT INTO audit.access_log
         (id, tenant_id, actor_user_id, patient_id, resource, resource_id, purpose, request_id, ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        uuidv7(),
        ctx.tenantId,
        ctx.user.id,
        input.patientId ?? null,
        input.resource,
        input.resourceId ?? null,
        input.purpose ?? null,
        ctx.requestId,
        ctx.ip,
      ],
    );
  }

  /** Evento de domínio na outbox, escrito na mesma transação do fato. */
  async publish(
    tx: PoolClient,
    ctx: { tenantId: string | null },
    event: { aggregateTable: string; aggregateId: string; eventType: string; payload?: Record<string, unknown> },
  ): Promise<void> {
    if (!ctx.tenantId) return;
    await tx.query(
      `INSERT INTO platform.domain_events (id, tenant_id, aggregate_table, aggregate_id, event_type, payload)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        uuidv7(),
        ctx.tenantId,
        event.aggregateTable,
        event.aggregateId,
        event.eventType,
        JSON.stringify(event.payload ?? {}),
      ],
    );
  }

  /** Notificação interna para um usuário do tenant. */
  async notify(
    tx: PoolClient,
    tenantId: string,
    userId: string,
    input: { kind: string; title: string; body?: string; link?: string; relatedTable?: string; relatedId?: string },
  ): Promise<void> {
    await tx.query(
      `INSERT INTO platform.notifications (id, tenant_id, user_id, kind, title, body, link, related_table, related_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        uuidv7(),
        tenantId,
        userId,
        input.kind,
        input.title,
        input.body ?? null,
        input.link ?? null,
        input.relatedTable ?? null,
        input.relatedId ?? null,
      ],
    );
  }
}
