import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { AuditService } from '../../common/audit.service';
import type { RequestContext } from '../../common/request-context';
import { contextToTenantContext } from '../../common/request-context';

export interface AuditQuery {
  entityTable?: string;
  entityId?: string;
  actorUserId?: string;
  category?: string;
  action?: string;
  from?: string;
  to?: string;
  limit: number;
  cursor?: string;
}

/**
 * Consulta de auditoria e de log de acesso. Somente leitura: as tabelas têm
 * trigger append-only, então nem esta API nem o dono do banco alteram o
 * registro pela aplicação.
 */
@Injectable()
export class AuditQueryService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async listAudit(ctx: RequestContext, params: AuditQuery) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query<{
        id: string;
        occurred_at: Date;
        actor_name: string | null;
        actor_type: string;
        on_behalf_of_name: string | null;
        category: string;
        action: string;
        entity_schema: string | null;
        entity_table: string | null;
        entity_id: string | null;
        before: unknown;
        after: unknown;
        reason: string | null;
        request_id: string | null;
        ip: string | null;
      }>(
        `SELECT a.id, a.occurred_at, u.name AS actor_name, a.actor_type,
                ob.name AS on_behalf_of_name, a.category, a.action, a.entity_schema, a.entity_table,
                a.entity_id, a.before, a.after, a.reason, a.request_id, a.ip
           FROM audit.audit_log a
           LEFT JOIN iam.users u ON u.id = a.actor_user_id
           LEFT JOIN iam.users ob ON ob.id = a.on_behalf_of
          WHERE a.tenant_id = $1
            AND ($2::text IS NULL OR a.entity_table = $2)
            AND ($3::uuid IS NULL OR a.entity_id = $3)
            AND ($4::uuid IS NULL OR a.actor_user_id = $4)
            AND ($5::text IS NULL OR a.category = $5)
            AND ($6::text IS NULL OR a.action = $6)
            AND ($7::timestamptz IS NULL OR a.occurred_at >= $7)
            AND ($8::timestamptz IS NULL OR a.occurred_at < $8)
            AND ($9::uuid IS NULL OR a.id < $9)
          ORDER BY a.occurred_at DESC, a.id DESC
          LIMIT $10`,
        [
          ctx.tenantId,
          params.entityTable ?? null,
          params.entityId ?? null,
          params.actorUserId ?? null,
          params.category ?? null,
          params.action ?? null,
          params.from ?? null,
          params.to ?? null,
          params.cursor ?? null,
          params.limit,
        ],
      );

      return {
        items: rows.map((r) => ({
          id: r.id,
          occurredAt: r.occurred_at.toISOString(),
          actorName: r.actor_name,
          actorType: r.actor_type,
          onBehalfOfName: r.on_behalf_of_name,
          category: r.category,
          action: r.action,
          entity: r.entity_table ? `${r.entity_schema ?? ''}.${r.entity_table}` : null,
          entityId: r.entity_id,
          before: r.before,
          after: r.after,
          reason: r.reason,
          requestId: r.request_id,
          ip: r.ip,
        })),
        nextCursor: rows.length === params.limit ? (rows[rows.length - 1]?.id ?? null) : null,
      };
    });
  }

  /** Histórico de acessos a dado sensível. Exigido pela LGPD (art. 9 e 18). */
  async listAccess(
    ctx: RequestContext,
    params: { patientId?: string; actorUserId?: string; from?: string; to?: string; limit: number },
  ) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query<{
        id: string;
        occurred_at: Date;
        actor_name: string | null;
        patient_id: string | null;
        patient_name: string | null;
        resource: string;
        resource_id: string | null;
        purpose: string | null;
        ip: string | null;
      }>(
        `SELECT l.id, l.occurred_at, u.name AS actor_name, l.patient_id, p.name AS patient_name,
                l.resource, l.resource_id, l.purpose, l.ip
           FROM audit.access_log l
           LEFT JOIN iam.users u ON u.id = l.actor_user_id
           LEFT JOIN registry.patients p ON p.id = l.patient_id AND p.tenant_id = l.tenant_id
          WHERE l.tenant_id = $1
            AND ($2::uuid IS NULL OR l.patient_id = $2)
            AND ($3::uuid IS NULL OR l.actor_user_id = $3)
            AND ($4::timestamptz IS NULL OR l.occurred_at >= $4)
            AND ($5::timestamptz IS NULL OR l.occurred_at < $5)
          ORDER BY l.occurred_at DESC
          LIMIT $6`,
        [
          ctx.tenantId,
          params.patientId ?? null,
          params.actorUserId ?? null,
          params.from ?? null,
          params.to ?? null,
          params.limit,
        ],
      );

      return {
        items: rows.map((r) => ({
          id: r.id,
          occurredAt: r.occurred_at.toISOString(),
          actorName: r.actor_name,
          patientId: r.patient_id,
          patientName: r.patient_name,
          resource: r.resource,
          resourceId: r.resource_id,
          purpose: r.purpose,
          ip: r.ip,
        })),
      };
    });
  }

  /** Trilha de um registro específico, usada nas telas de histórico. */
  async entityHistory(ctx: RequestContext, table: string, id: string) {
    const result = await this.listAudit(ctx, { entityTable: table, entityId: id, limit: 100 });
    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      await this.audit.recordAccess(tx, ctx, { resource: 'record', resourceId: id, purpose: 'audit_trail' });
    });
    return result;
  }
}
