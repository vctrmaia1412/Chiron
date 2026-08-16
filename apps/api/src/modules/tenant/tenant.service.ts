import { Injectable } from '@nestjs/common';
import { MODULES, MODULE_BY_KEY, dependentModules, missingModuleDependencies, type ModuleKey } from '@chiron/contracts';
import { DatabaseService } from '../../database/database.service';
import { AuditService } from '../../common/audit.service';
import { AppError } from '../../common/errors';
import type { RequestContext } from '../../common/request-context';
import { contextToTenantContext } from '../../common/request-context';

@Injectable()
export class TenantService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async get(ctx: RequestContext) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query<{
        id: string;
        name: string;
        slug: string;
        status: string;
        timezone: string;
        locale: string;
        settings: Record<string, unknown>;
        plan_key: string | null;
        plan_name: string | null;
      }>(
        `SELECT t.id, t.name, t.slug, t.status, t.timezone, t.locale, t.settings,
                p.key AS plan_key, p.name AS plan_name
           FROM platform.tenants t
           LEFT JOIN platform.plans p ON p.id = t.plan_id
          WHERE t.id = $1`,
        [ctx.tenantId],
      );
      const tenant = rows[0];
      if (!tenant) throw AppError.notFound('Organização');
      return tenant;
    });
  }

  async update(ctx: RequestContext, input: { name?: string; timezone?: string; settings?: Record<string, unknown> }) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const before = await tx.query(`SELECT name, timezone, settings FROM platform.tenants WHERE id = $1`, [
        ctx.tenantId,
      ]);
      const { rows } = await tx.query(
        `UPDATE platform.tenants
            SET name = COALESCE($2, name),
                timezone = COALESCE($3, timezone),
                settings = COALESCE($4, settings)
          WHERE id = $1
        RETURNING id, name, slug, status, timezone, locale, settings`,
        [ctx.tenantId, input.name ?? null, input.timezone ?? null, input.settings ? JSON.stringify(input.settings) : null],
      );
      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'tenant.update',
        entitySchema: 'platform',
        entityTable: 'tenants',
        entityId: ctx.tenantId ?? undefined,
        before: before.rows[0],
        after: { name: input.name, timezone: input.timezone },
      });
      return rows[0];
    });
  }

  async listFacilities(ctx: RequestContext) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query(
        `SELECT id, name, code, kind, address, phone, timezone, is_default, allow_schedule_overlap
           FROM platform.facilities
          WHERE tenant_id = $1 AND deleted_at IS NULL
          ORDER BY is_default DESC, name`,
        [ctx.tenantId],
      );
      return rows;
    });
  }

  async updateFacility(
    ctx: RequestContext,
    id: string,
    input: { name?: string; phone?: string; timezone?: string; address?: unknown; allowScheduleOverlap?: boolean },
  ) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query(
        `UPDATE platform.facilities
            SET name = COALESCE($3, name),
                phone = COALESCE($4, phone),
                timezone = COALESCE($5, timezone),
                address = COALESCE($6, address),
                allow_schedule_overlap = COALESCE($7, allow_schedule_overlap)
          WHERE id = $2 AND tenant_id = $1 AND deleted_at IS NULL
        RETURNING id, name, code, kind, address, phone, timezone, is_default, allow_schedule_overlap`,
        [
          ctx.tenantId,
          id,
          input.name ?? null,
          input.phone ?? null,
          input.timezone ?? null,
          input.address ? JSON.stringify(input.address) : null,
          input.allowScheduleOverlap ?? null,
        ],
      );
      if (rows.length === 0) throw AppError.notFound('Unidade');
      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'facility.update',
        entitySchema: 'platform',
        entityTable: 'facilities',
        entityId: id,
        after: { name: input.name },
      });
      return rows[0];
    });
  }

  async listEntitlements(ctx: RequestContext) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query<{ module_key: string; state: string; source: string; expires_at: Date | null; grace_until: Date | null }>(
        `SELECT module_key, state, source, expires_at, grace_until
           FROM platform.tenant_entitlements WHERE tenant_id = $1`,
        [ctx.tenantId],
      );
      const byKey = new Map(rows.map((r) => [r.module_key, r]));
      return MODULES.map((m) => {
        const row = byKey.get(m.key);
        return {
          key: m.key,
          name: m.name,
          dependsOn: m.dependsOn,
          alwaysOn: m.alwaysOn,
          state: m.alwaysOn ? 'active' : (row?.state ?? 'disabled'),
          source: row?.source ?? null,
          expiresAt: row?.expires_at?.toISOString() ?? null,
          graceUntil: row?.grace_until?.toISOString() ?? null,
        };
      });
    });
  }

  /**
   * Habilita ou desabilita um módulo. As dependências são validadas no backend:
   * não é um interruptor visual.
   */
  async setEntitlement(ctx: RequestContext, moduleKey: ModuleKey, state: 'active' | 'disabled') {
    const def = MODULE_BY_KEY[moduleKey];
    if (!def) throw AppError.validation('Módulo desconhecido.');
    if (def.alwaysOn && state === 'disabled') {
      throw AppError.validation('O módulo núcleo não pode ser desabilitado.');
    }

    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows: current } = await tx.query<{ module_key: string; state: string }>(
        `SELECT module_key, state FROM platform.tenant_entitlements WHERE tenant_id = $1`,
        [ctx.tenantId],
      );
      const enabled = new Set<ModuleKey>(
        current.filter((r) => r.state === 'active' || r.state === 'trial').map((r) => r.module_key as ModuleKey),
      );
      enabled.add('core');

      if (state === 'active') {
        enabled.add(moduleKey);
        const missing = missingModuleDependencies([...enabled]).find((p) => p.module === moduleKey);
        if (missing) {
          throw new AppError(
            'DEPENDENCY_REQUIRED',
            `Habilite antes: ${missing.missing.map((k) => MODULE_BY_KEY[k]?.name ?? k).join(', ')}.`,
            { missing: missing.missing },
          );
        }
      } else {
        const dependents = dependentModules(moduleKey, [...enabled].filter((k) => k !== moduleKey));
        if (dependents.length > 0) {
          throw new AppError(
            'DEPENDENCY_REQUIRED',
            `Desabilite antes os módulos que dependem deste: ${dependents
              .map((k) => MODULE_BY_KEY[k]?.name ?? k)
              .join(', ')}.`,
            { dependents },
          );
        }
      }

      await tx.query(
        `INSERT INTO platform.tenant_entitlements (tenant_id, module_key, state, source, granted_by_user_id)
         VALUES ($1, $2, $3, 'manual', $4)
         ON CONFLICT (tenant_id, module_key)
         DO UPDATE SET state = EXCLUDED.state, granted_by_user_id = EXCLUDED.granted_by_user_id, updated_at = now()`,
        [ctx.tenantId, moduleKey, state, ctx.user.id],
      );

      // invalida o cache de permissões de todas as sessões do tenant
      await tx.query(`UPDATE platform.tenants SET perm_version = perm_version + 1 WHERE id = $1`, [ctx.tenantId]);

      await this.audit.record(tx, ctx, {
        category: 'entitlement_change',
        action: `entitlement.${state}`,
        entitySchema: 'platform',
        entityTable: 'tenant_entitlements',
        entityId: ctx.tenantId ?? undefined,
        after: { moduleKey, state },
      });

      return { moduleKey, state };
    });
  }
}
