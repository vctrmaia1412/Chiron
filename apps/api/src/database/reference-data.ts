import { Client } from 'pg';
import { MODULES, PERMISSIONS, PLANS, ROLE_TEMPLATES } from '@chiron/contracts';
import { OBSERVATION_CODES } from '@chiron/domain';
import { env } from '../config/env';
import { SPECIES_CATALOG } from './reference/species';
import { EXAM_CATALOG, REFERENCE_RANGES } from './reference/exams';

/**
 * Dado de referência do produto (módulos, planos, permissões, espécies,
 * códigos de observação, catálogo de exames). Não é seed de demonstração:
 * roda junto da migração, é idempotente e mantém o banco em sincronia com
 * os contratos versionados em `packages/`.
 */
export async function syncReferenceData(connectionString?: string): Promise<void> {
  const url = connectionString ?? env().DATABASE_MIGRATION_URL ?? env().DATABASE_URL;
  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    await client.query('BEGIN');

    for (const mod of MODULES) {
      await client.query(
        `INSERT INTO platform.modules (key, name, depends_on, always_on, sort)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (key) DO UPDATE
           SET name = EXCLUDED.name, depends_on = EXCLUDED.depends_on,
               always_on = EXCLUDED.always_on, sort = EXCLUDED.sort`,
        [mod.key, mod.name, mod.dependsOn, mod.alwaysOn, mod.sort],
      );
    }

    for (const permission of PERMISSIONS) {
      await client.query(
        `INSERT INTO iam.permissions (key, module_key, description)
         VALUES ($1,$2,$3)
         ON CONFLICT (key) DO UPDATE
           SET module_key = EXCLUDED.module_key, description = EXCLUDED.description`,
        [permission.key, permission.module, permission.description],
      );
    }
    await client.query(
      `DELETE FROM iam.permissions WHERE key <> ALL($1::text[])`,
      [PERMISSIONS.map((p) => p.key)],
    );

    // Papéis do sistema como catálogo global (tenant_id nulo). Sem eles, uma
    // organização criada fora do seed nasce sem papel algum: a lista de papéis
    // volta vazia e o convite falha com "Papel desconhecido". A RLS de
    // iam.roles é da família catálogo híbrido e já enxerga o que é global.
    for (const template of ROLE_TEMPLATES) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO iam.roles
           (tenant_id, key, name, description, template_key, template_version, is_system, requires_license, sort)
         VALUES (NULL,$1,$2,$3,$1,1,true,$4,$5)
         ON CONFLICT (tenant_id, key) DO UPDATE
           SET name = EXCLUDED.name, description = EXCLUDED.description,
               template_key = EXCLUDED.template_key, template_version = EXCLUDED.template_version,
               is_system = EXCLUDED.is_system, requires_license = EXCLUDED.requires_license,
               sort = EXCLUDED.sort
         RETURNING id`,
        [template.key, template.name, template.description, template.clinical, template.sort],
      );
      const roleId = rows[0]?.id;
      if (!roleId) continue;

      // Permissão que saiu do template precisa sair do papel: manter o que
      // sobrou daria acesso que o contrato já removeu.
      await client.query(
        `DELETE FROM iam.role_permissions WHERE role_id = $1 AND permission_key <> ALL($2::text[])`,
        [roleId, template.permissions],
      );
      for (const permission of template.permissions) {
        await client.query(
          `INSERT INTO iam.role_permissions (role_id, permission_key) VALUES ($1,$2)
           ON CONFLICT DO NOTHING`,
          [roleId, permission],
        );
      }
    }

    for (const plan of PLANS) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO platform.plans (key, name, limits, sort, active)
         VALUES ($1,$2,$3,$4,true)
         ON CONFLICT (key) DO UPDATE
           SET name = EXCLUDED.name, limits = EXCLUDED.limits, sort = EXCLUDED.sort
         RETURNING id`,
        [plan.key, plan.name, JSON.stringify(plan.limits ?? {}), plan.sort ?? 0],
      );
      const planId = rows[0]?.id;
      if (!planId) continue;

      await client.query(`DELETE FROM platform.plan_modules WHERE plan_id = $1 AND module_key <> ALL($2::text[])`, [
        planId,
        plan.modules,
      ]);
      for (const moduleKey of plan.modules) {
        await client.query(
          `INSERT INTO platform.plan_modules (plan_id, module_key) VALUES ($1,$2)
           ON CONFLICT DO NOTHING`,
          [planId, moduleKey],
        );
      }
    }

    for (const code of OBSERVATION_CODES) {
      await client.query(
        `INSERT INTO clinical.observation_codes (code, name, value_kind, canonical_uom, allowed_uoms, allowed_codes, scale, sort)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (code) DO UPDATE
           SET name = EXCLUDED.name, value_kind = EXCLUDED.value_kind,
               canonical_uom = EXCLUDED.canonical_uom, allowed_uoms = EXCLUDED.allowed_uoms,
               allowed_codes = EXCLUDED.allowed_codes, scale = EXCLUDED.scale, sort = EXCLUDED.sort`,
        [
          code.code,
          code.name,
          code.valueKind,
          code.canonicalUom ?? null,
          code.allowedUoms ?? [],
          code.allowedCodes ?? [],
          code.scale ?? null,
          code.sort ?? 0,
        ],
      );
    }

    const speciesIds = new Map<string, string>();
    for (const species of SPECIES_CATALOG) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO registry.species
           (tenant_id, code, name_pt, name_scientific, taxon_class, category, default_weight_uom,
            supports_group, requires_scientific_name, observation_panel, attribute_schema, sort, active)
         VALUES (NULL,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true)
         ON CONFLICT (tenant_id, code) DO UPDATE
           SET name_pt = EXCLUDED.name_pt, name_scientific = EXCLUDED.name_scientific,
               taxon_class = EXCLUDED.taxon_class, category = EXCLUDED.category,
               default_weight_uom = EXCLUDED.default_weight_uom, supports_group = EXCLUDED.supports_group,
               requires_scientific_name = EXCLUDED.requires_scientific_name,
               observation_panel = EXCLUDED.observation_panel, attribute_schema = EXCLUDED.attribute_schema,
               sort = EXCLUDED.sort
         RETURNING id`,
        [
          species.code,
          species.namePt,
          species.nameScientific,
          species.taxonClass,
          species.category,
          species.defaultWeightUom,
          species.supportsGroup,
          species.requiresScientificName,
          species.observationPanel,
          JSON.stringify(species.attributeSchema),
          species.sort,
        ],
      );
      const speciesId = rows[0]?.id;
      if (!speciesId) continue;
      speciesIds.set(species.code, speciesId);

      for (const breed of species.breeds) {
        await client.query(
          `INSERT INTO registry.breeds (tenant_id, species_id, name, size_class, active)
           VALUES (NULL,$1,$2,$3,true)
           ON CONFLICT (tenant_id, species_id, name) DO UPDATE SET size_class = EXCLUDED.size_class`,
          [speciesId, breed.name, breed.sizeClass ?? null],
        );
      }
    }

    for (const range of REFERENCE_RANGES) {
      const speciesId = speciesIds.get(range.speciesCode);
      if (!speciesId) continue;
      const existing = await client.query(
        `SELECT 1 FROM registry.reference_ranges
          WHERE tenant_id IS NULL AND species_id = $1 AND parameter_code = $2
            AND breed_id IS NULL AND life_stage IS NULL AND sex IS NULL`,
        [speciesId, range.parameterCode],
      );
      if (existing.rowCount) continue;

      await client.query(
        `INSERT INTO registry.reference_ranges
           (tenant_id, species_id, parameter_code, min_value, max_value, uom, source, validation_status)
         VALUES (NULL,$1,$2,$3,$4,$5,$6,'unvalidated')`,
        [speciesId, range.parameterCode, range.min, range.max, range.uom, range.source],
      );
    }

    for (const exam of EXAM_CATALOG) {
      await client.query(
        `INSERT INTO lab.exam_catalog (tenant_id, code, name, category, specimen_kind, turnaround_hours, analytes, active)
         VALUES (NULL,$1,$2,$3,$4,$5,$6,true)
         ON CONFLICT (tenant_id, code) DO UPDATE
           SET name = EXCLUDED.name, category = EXCLUDED.category, specimen_kind = EXCLUDED.specimen_kind,
               turnaround_hours = EXCLUDED.turnaround_hours, analytes = EXCLUDED.analytes`,
        [
          exam.code,
          exam.name,
          exam.category,
          exam.specimenKind,
          exam.turnaroundHours,
          JSON.stringify(exam.analytes),
        ],
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  syncReferenceData()
    .then(() => {
      console.log('Dados de referência sincronizados.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Falha ao sincronizar dados de referência:', error);
      process.exit(1);
    });
}
