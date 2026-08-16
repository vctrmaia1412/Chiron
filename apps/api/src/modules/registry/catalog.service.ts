import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { AuditService } from '../../common/audit.service';
import { AppError } from '../../common/errors';
import { uuidv7 } from '../../common/uuid';
import type { RequestContext } from '../../common/request-context';
import { contextToTenantContext } from '../../common/request-context';

@Injectable()
export class CatalogService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  /** Espécies: catálogo global mais o que o tenant cadastrou. */
  async listSpecies(ctx: RequestContext) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query(
        `SELECT id, code, name_pt AS "namePt", name_scientific AS "nameScientific", taxon_class AS "taxonClass",
                category, default_weight_uom AS "defaultWeightUom", supports_group AS "supportsGroup",
                requires_scientific_name AS "requiresScientificName", observation_panel AS "observationPanel",
                (tenant_id IS NULL) AS "isGlobal"
           FROM registry.species
          WHERE active AND (tenant_id IS NULL OR tenant_id = $1)
          ORDER BY sort, name_pt`,
        [ctx.tenantId],
      );
      return rows;
    });
  }

  async listBreeds(ctx: RequestContext, speciesId?: string) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query(
        `SELECT id, species_id AS "speciesId", name, size_class AS "sizeClass", (tenant_id IS NULL) AS "isGlobal"
           FROM registry.breeds
          WHERE active AND (tenant_id IS NULL OR tenant_id = $1)
            AND ($2::uuid IS NULL OR species_id = $2)
          ORDER BY name`,
        [ctx.tenantId, speciesId ?? null],
      );
      return rows;
    });
  }

  async createBreed(ctx: RequestContext, input: { speciesId: string; name: string; sizeClass?: string }) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const id = uuidv7();
      const { rows } = await tx.query(
        `INSERT INTO registry.breeds (id, tenant_id, species_id, name, size_class)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, species_id AS "speciesId", name, size_class AS "sizeClass", false AS "isGlobal"`,
        [id, ctx.tenantId, input.speciesId, input.name, input.sizeClass ?? null],
      );
      return rows[0];
    });
  }

  async listObservationCodes(ctx: RequestContext, speciesId?: string) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const panel = speciesId
        ? await tx.query<{ observation_panel: string[] }>(
            `SELECT observation_panel FROM registry.species WHERE id = $1 AND (tenant_id IS NULL OR tenant_id = $2)`,
            [speciesId, ctx.tenantId],
          )
        : { rows: [] };

      const { rows } = await tx.query<{
        code: string;
        name: string;
        value_kind: string;
        canonical_uom: string | null;
        allowed_uoms: string[];
        allowed_codes: string[];
        scale: string | null;
        sort: number;
      }>(`SELECT code, name, value_kind, canonical_uom, allowed_uoms, allowed_codes, scale, sort
            FROM clinical.observation_codes ORDER BY sort`);

      const preferred = panel.rows[0]?.observation_panel ?? [];
      return rows.map((r) => ({
        code: r.code,
        name: r.name,
        valueKind: r.value_kind,
        canonicalUom: r.canonical_uom,
        allowedUoms: r.allowed_uoms,
        allowedCodes: r.allowed_codes,
        scale: r.scale,
        sort: r.sort,
        inPanel: preferred.length === 0 ? true : preferred.includes(r.code),
      }));
    });
  }

  async listReferenceRanges(ctx: RequestContext, speciesId?: string) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query(
        `SELECT rr.id, rr.species_id AS "speciesId", s.name_pt AS "speciesName", rr.parameter_code AS "parameterCode",
                rr.life_stage AS "lifeStage", rr.sex, rr.weight_min_kg::text AS "weightMinKg",
                rr.weight_max_kg::text AS "weightMaxKg", rr.min_value::text AS "minValue",
                rr.max_value::text AS "maxValue", rr.uom, rr.source,
                rr.validation_status AS "validationStatus", (rr.tenant_id IS NULL) AS "isGlobal"
           FROM registry.reference_ranges rr
           JOIN registry.species s ON s.id = rr.species_id
          WHERE (rr.tenant_id IS NULL OR rr.tenant_id = $1)
            AND ($2::uuid IS NULL OR rr.species_id = $2)
          ORDER BY s.name_pt, rr.parameter_code, rr.life_stage NULLS FIRST`,
        [ctx.tenantId, speciesId ?? null],
      );
      return rows;
    });
  }

  /**
   * Validação da faixa pelo veterinário responsável: só depois disso o
   * sistema passa a destacar "fora da faixa" como alerta, não como sugestão.
   */
  async validateReferenceRange(ctx: RequestContext, rangeId: string) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const global = await tx.query<{
        species_id: string;
        breed_id: string | null;
        parameter_code: string;
        life_stage: string | null;
        sex: string | null;
        weight_min_kg: string | null;
        weight_max_kg: string | null;
        min_value: string | null;
        max_value: string | null;
        uom: string;
        source: string | null;
        tenant_id: string | null;
      }>(`SELECT * FROM registry.reference_ranges WHERE id = $1 AND (tenant_id IS NULL OR tenant_id = $2)`, [
        rangeId,
        ctx.tenantId,
      ]);
      const range = global.rows[0];
      if (!range) throw AppError.notFound('Faixa de referência');

      if (range.tenant_id === null) {
        // Faixa global: cria uma cópia validada do tenant (não altera o catálogo global).
        const id = uuidv7();
        await tx.query(
          `INSERT INTO registry.reference_ranges
             (id, tenant_id, species_id, breed_id, parameter_code, life_stage, sex, weight_min_kg, weight_max_kg,
              min_value, max_value, uom, source, validation_status, validated_by, validated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'validated',$14, now())`,
          [
            id,
            ctx.tenantId,
            range.species_id,
            range.breed_id,
            range.parameter_code,
            range.life_stage,
            range.sex,
            range.weight_min_kg,
            range.weight_max_kg,
            range.min_value,
            range.max_value,
            range.uom,
            range.source,
            ctx.user.id,
          ],
        );
        await this.audit.record(tx, ctx, {
          category: 'mutation',
          action: 'reference_range.validate',
          entitySchema: 'registry',
          entityTable: 'reference_ranges',
          entityId: id,
        });
        return { id, validated: true };
      }

      await tx.query(
        `UPDATE registry.reference_ranges
            SET validation_status = 'validated', validated_by = $2, validated_at = now()
          WHERE id = $1 AND tenant_id = $3`,
        [rangeId, ctx.user.id, ctx.tenantId],
      );
      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'reference_range.validate',
        entitySchema: 'registry',
        entityTable: 'reference_ranges',
        entityId: rangeId,
      });
      return { id: rangeId, validated: true };
    });
  }

  async upsertReferenceRange(
    ctx: RequestContext,
    input: {
      speciesId: string;
      parameterCode: string;
      lifeStage?: string | null;
      minValue?: number | null;
      maxValue?: number | null;
      uom: string;
    },
  ) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const id = uuidv7();
      const { rows } = await tx.query(
        `INSERT INTO registry.reference_ranges
           (id, tenant_id, species_id, parameter_code, life_stage, min_value, max_value, uom,
            source, validation_status, validated_by, validated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'tenant','validated',$9, now())
         RETURNING id`,
        [
          id,
          ctx.tenantId,
          input.speciesId,
          input.parameterCode,
          input.lifeStage ?? null,
          input.minValue ?? null,
          input.maxValue ?? null,
          input.uom,
          ctx.user.id,
        ],
      );
      return rows[0];
    });
  }

  async listServices(ctx: RequestContext, includeInactive = false) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query(
        `SELECT id, key, name, category, default_duration_min AS "defaultDurationMin",
                default_price::text AS "defaultPrice", requires_professional AS "requiresProfessional",
                requires_resource AS "requiresResource", color, active
           FROM registry.service_catalog
          WHERE tenant_id = $1 AND ($2 OR active)
          ORDER BY category, name`,
        [ctx.tenantId, includeInactive],
      );
      return rows;
    });
  }

  async createService(ctx: RequestContext, input: Record<string, unknown>) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const id = uuidv7();
      const { rows } = await tx.query(
        `INSERT INTO registry.service_catalog
           (id, tenant_id, key, name, category, default_duration_min, default_price,
            requires_professional, requires_resource, color, active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id, key, name, category, default_duration_min AS "defaultDurationMin",
                   default_price::text AS "defaultPrice", requires_professional AS "requiresProfessional",
                   requires_resource AS "requiresResource", color, active`,
        [
          id,
          ctx.tenantId,
          input.key,
          input.name,
          input.category,
          input.defaultDurationMin ?? 30,
          input.defaultPrice ?? null,
          input.requiresProfessional ?? true,
          input.requiresResource ?? false,
          input.color ?? null,
          input.active ?? true,
        ],
      );
      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'service.create',
        entitySchema: 'registry',
        entityTable: 'service_catalog',
        entityId: id,
      });
      return rows[0];
    });
  }

  async updateService(ctx: RequestContext, id: string, input: Record<string, unknown>) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query(
        `UPDATE registry.service_catalog
            SET name = COALESCE($3, name),
                category = COALESCE($4, category),
                default_duration_min = COALESCE($5, default_duration_min),
                default_price = COALESCE($6, default_price),
                requires_professional = COALESCE($7, requires_professional),
                requires_resource = COALESCE($8, requires_resource),
                color = COALESCE($9, color),
                active = COALESCE($10, active)
          WHERE id = $2 AND tenant_id = $1
        RETURNING id, key, name, category, default_duration_min AS "defaultDurationMin",
                  default_price::text AS "defaultPrice", requires_professional AS "requiresProfessional",
                  requires_resource AS "requiresResource", color, active`,
        [
          ctx.tenantId,
          id,
          input.name ?? null,
          input.category ?? null,
          input.defaultDurationMin ?? null,
          input.defaultPrice ?? null,
          input.requiresProfessional ?? null,
          input.requiresResource ?? null,
          input.color ?? null,
          input.active ?? null,
        ],
      );
      if (rows.length === 0) throw AppError.notFound('Serviço');
      return rows[0];
    });
  }

  async listProfessionals(ctx: RequestContext) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query(
        `SELECT id, user_id AS "userId", name, council, council_number AS "councilNumber",
                council_state AS "councilState",
                (council_number IS NOT NULL AND (council_valid_until IS NULL OR council_valid_until >= CURRENT_DATE)) AS "isLicensed",
                specialties, color, is_external AS "isExternal", active
           FROM registry.professionals
          WHERE tenant_id = $1 AND deleted_at IS NULL
          ORDER BY active DESC, name`,
        [ctx.tenantId],
      );
      return rows;
    });
  }

  async createProfessional(ctx: RequestContext, input: Record<string, unknown>) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const id = uuidv7();
      const { rows } = await tx.query(
        `INSERT INTO registry.professionals
           (id, tenant_id, name, council, council_number, council_state, specialties, color, is_external)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id, name, council, council_number AS "councilNumber", council_state AS "councilState",
                   specialties, color, is_external AS "isExternal", active`,
        [
          id,
          ctx.tenantId,
          input.name,
          input.council ?? null,
          input.councilNumber ?? null,
          input.councilState ?? null,
          input.specialties ?? [],
          input.color ?? null,
          input.isExternal ?? false,
        ],
      );
      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'professional.create',
        entitySchema: 'registry',
        entityTable: 'professionals',
        entityId: id,
      });
      return rows[0];
    });
  }

  async listExamCatalog(ctx: RequestContext) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query(
        `SELECT id, code, name, category, specimen_kind AS "specimenKind",
                turnaround_hours AS "turnaroundHours", analytes, (tenant_id IS NULL) AS "isGlobal"
           FROM lab.exam_catalog
          WHERE active AND (tenant_id IS NULL OR tenant_id = $1)
          ORDER BY category, name`,
        [ctx.tenantId],
      );
      return rows;
    });
  }
}
