import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  addDaysIso,
  doseUnitLabel,
  durationLabel,
  frequencyLabel,
  nextDoseFor,
  normalizeIngredient,
  parseDoseUom,
  type FrequencyKind,
} from '@chiron/domain';
import type {
  ActiveMedication,
  ConditionSuggestion,
  CreateNoteTemplate,
  CreatePatientProblem,
  CreatePrescriptionTemplate,
  MedicationSuggestion,
  NoteTemplate,
  PatientClinicalSummary,
  PatientProblem,
  PatientProtocolSuggestion,
  PrescriptionTemplate,
} from '@chiron/contracts';
import { DatabaseService } from '../../database/database.service';
import { AuditService } from '../../common/audit.service';
import { AppError } from '../../common/errors';
import { uuidv7 } from '../../common/uuid';
import type { RequestContext } from '../../common/request-context';
import { contextToTenantContext } from '../../common/request-context';
import { PROBLEM_SELECT, toProblem, upsertProblemInTx, type ProblemRow } from './problems';

/** Rótulo curto de via, para a linha de posologia do resumo. */
const ROUTE_SHORT: Record<string, string> = {
  oral: 'VO',
  sc: 'SC',
  im: 'IM',
  iv: 'IV',
  im_pectoral: 'IM peitoral',
  topical: 'tópico',
  ophthalmic: 'oftálmico',
  otic: 'otológico',
  inhalation: 'inalatório',
  intranasal: 'intranasal',
  sublingual: 'sublingual',
  rectal: 'retal',
  intramammary: 'intramamário',
  intrauterine: 'intrauterino',
  epidural: 'epidural',
  intracoelomic: 'intracelomático',
};

function formatDecimal(value: string | null): string | null {
  if (value == null) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return numeric.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

interface TemplateRow {
  id: string;
  tenant_id: string | null;
  species_id: string | null;
  kind: string;
  name: string;
  schema: {
    shortcut?: string;
    speciesCodes?: string[];
    serviceCategories?: string[];
    keywords?: string[];
    sections?: Record<string, string>;
  } | null;
  body_default: string | null;
}

/**
 * Apoio ao registro clínico rápido. Nada aqui cria obrigação: tudo devolve
 * texto ou valores para o veterinário aceitar, ajustar ou ignorar.
 */
@Injectable()
export class ChartingService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  // ----------------------------------------------------------- modelos
  private toTemplate(row: TemplateRow): NoteTemplate {
    const schema = row.schema ?? {};
    return {
      id: row.id,
      scope: row.tenant_id ? 'tenant' : 'global',
      kind: row.kind === 'snippet' ? 'snippet' : 'template',
      name: row.name,
      shortcut: schema.shortcut ?? null,
      speciesId: row.species_id,
      serviceCategories: schema.serviceCategories ?? [],
      keywords: schema.keywords ?? [],
      sections: (schema.sections ?? {}) as NoteTemplate['sections'],
      body: row.body_default,
    };
  }

  async listNoteTemplates(ctx: RequestContext, params: { speciesId?: string }): Promise<{ items: NoteTemplate[] }> {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query<TemplateRow>(
        `SELECT t.id, t.tenant_id, t.species_id, t.kind, t.name, t.schema, t.body_default
           FROM clinical.note_templates t
          WHERE t.active
            AND (t.tenant_id IS NULL OR t.tenant_id = $1)
            AND (
              $2::uuid IS NULL
              OR (t.tenant_id IS NOT NULL AND (t.species_id IS NULL OR t.species_id = $2))
              OR (t.tenant_id IS NULL AND (
                    jsonb_array_length(COALESCE(t.schema->'speciesCodes', '[]'::jsonb)) = 0
                    OR (t.schema->'speciesCodes') ? (SELECT code FROM registry.species WHERE id = $2)))
            )
          ORDER BY (t.tenant_id IS NULL), t.kind, t.name`,
        [ctx.tenantId, params.speciesId ?? null],
      );
      return { items: rows.map((row) => this.toTemplate(row)) };
    });
  }

  async createNoteTemplate(ctx: RequestContext, input: CreateNoteTemplate): Promise<NoteTemplate> {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      if (input.shortcut) {
        const clash = await tx.query(
          `SELECT 1 FROM clinical.note_templates
            WHERE tenant_id = $1 AND active AND schema->>'shortcut' = $2`,
          [ctx.tenantId, input.shortcut],
        );
        if (clash.rowCount) throw AppError.conflict(`Já existe um modelo com o atalho /${input.shortcut}.`);
      }

      const id = uuidv7();
      const schema = {
        shortcut: input.shortcut ?? null,
        speciesCodes: [],
        serviceCategories: [],
        sections: input.kind === 'template' ? input.sections : {},
      };
      const { rows } = await tx.query<TemplateRow>(
        `INSERT INTO clinical.note_templates (id, tenant_id, species_id, kind, name, schema, body_default, active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true)
         RETURNING id, tenant_id, species_id, kind, name, schema, body_default`,
        [
          id,
          ctx.tenantId,
          input.speciesId ?? null,
          input.kind,
          input.name,
          JSON.stringify(schema),
          input.kind === 'snippet' ? (input.body ?? null) : null,
        ],
      );

      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'note_template.create',
        entitySchema: 'clinical',
        entityTable: 'note_templates',
        entityId: id,
        after: { kind: input.kind, shortcut: input.shortcut ?? null },
      });

      return this.toTemplate(rows[0] as TemplateRow);
    });
  }

  async removeNoteTemplate(ctx: RequestContext, id: string): Promise<void> {
    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const result = await tx.query(
        `UPDATE clinical.note_templates SET active = false WHERE id = $1 AND tenant_id = $2 AND active`,
        [id, ctx.tenantId],
      );
      if (!result.rowCount) throw AppError.notFound('Modelo');
      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'note_template.remove',
        entitySchema: 'clinical',
        entityTable: 'note_templates',
        entityId: id,
      });
    });
  }

  // ------------------------------------------------------- diagnósticos
  /**
   * Catálogo de fábrica mais o que a própria clínica já escreveu à mão, numa
   * busca sem acento. O catálogo é pequeno (centenas de linhas), então filtrar
   * na aplicação sai mais simples e mais tolerante do que depender de extensão
   * de banco para remover acento.
   */
  async searchConditions(
    ctx: RequestContext,
    params: { q: string; speciesId?: string; limit: number },
  ): Promise<{ items: ConditionSuggestion[] }> {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      // Uma conexão só dentro da transação: as consultas rodam em sequência
      // de qualquer jeito, então ficam sequenciais também no código.
      const catalog = await tx.query<{ id: string; name: string }>(
        `SELECT id, name FROM clinical.conditions
          WHERE active AND (tenant_id IS NULL OR tenant_id = $1)
            AND ($2::uuid IS NULL OR species_scope IS NULL OR $2 = ANY(species_scope))`,
        [ctx.tenantId, params.speciesId ?? null],
      );
      const history = await tx.query<{ name: string; condition_id: string | null; uses: number }>(
        `SELECT min(d.description) AS name, d.condition_id, count(*)::int AS uses
           FROM clinical.encounter_diagnoses d
          WHERE d.tenant_id = $1 AND d.kind <> 'ruled_out'
          GROUP BY d.condition_id, lower(d.description)
          ORDER BY uses DESC
          LIMIT 300`,
        [ctx.tenantId],
      );

      const query = normalizeIngredient(params.q);
      const tokens = query.split(' ').filter(Boolean);
      const usesByName = new Map<string, number>();
      for (const row of history.rows) {
        const key = normalizeIngredient(row.name);
        usesByName.set(key, (usesByName.get(key) ?? 0) + row.uses);
      }

      const scored: Array<ConditionSuggestion & { score: number }> = [];
      const seen = new Set<string>();

      const consider = (suggestion: ConditionSuggestion) => {
        const normalized = normalizeIngredient(suggestion.name);
        if (seen.has(normalized)) return;
        let score: number;
        if (!tokens.length) {
          score = usesByName.get(normalized) ?? 0;
          if (score === 0) return;
        } else {
          const words = normalized.split(' ');
          const allMatch = tokens.every((token) => words.some((word) => word.startsWith(token)));
          if (normalized.startsWith(query)) score = 300;
          else if (allMatch) score = 200;
          else if (normalized.includes(query)) score = 100;
          else return;
          score += Math.min(usesByName.get(normalized) ?? 0, 99);
        }
        seen.add(normalized);
        scored.push({ ...suggestion, score });
      };

      for (const row of catalog.rows) consider({ id: row.id, name: row.name, source: 'catalog' });
      for (const row of history.rows) {
        consider({ id: row.condition_id, name: row.name, source: row.condition_id ? 'catalog' : 'history' });
      }

      scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'pt-BR'));
      return {
        items: scored.slice(0, params.limit).map(({ id, name, source }) => ({ id, name, source })),
      };
    });
  }

  // ---------------------------------------------------------- problemas
  async listProblems(ctx: RequestContext, patientId: string): Promise<{ items: PatientProblem[] }> {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query<ProblemRow>(
        `SELECT ${PROBLEM_SELECT} FROM registry.patient_problems
          WHERE tenant_id = $1 AND patient_id = $2
          ORDER BY CASE status WHEN 'chronic' THEN 0 WHEN 'active' THEN 1 ELSE 2 END, created_at DESC`,
        [ctx.tenantId, patientId],
      );
      return { items: rows.map(toProblem) };
    });
  }

  async addProblem(ctx: RequestContext, patientId: string, input: CreatePatientProblem): Promise<PatientProblem> {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      await this.assertPatient(tx, ctx, patientId);
      const { id } = await upsertProblemInTx(tx, ctx.tenantId as string, patientId, input);
      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'patient.problem.add',
        entitySchema: 'registry',
        entityTable: 'patient_problems',
        entityId: id,
        after: { status: input.status },
      });
      const { rows } = await tx.query<ProblemRow>(
        `SELECT ${PROBLEM_SELECT} FROM registry.patient_problems WHERE id = $1 AND tenant_id = $2`,
        [id, ctx.tenantId],
      );
      return toProblem(rows[0] as ProblemRow);
    });
  }

  async updateProblem(
    ctx: RequestContext,
    patientId: string,
    problemId: string,
    status: PatientProblem['status'],
  ): Promise<PatientProblem> {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query<ProblemRow>(
        `UPDATE registry.patient_problems
            SET status = $4, resolved_at = CASE WHEN $4 = 'resolved' THEN now() ELSE NULL END
          WHERE id = $1 AND tenant_id = $2 AND patient_id = $3
          RETURNING ${PROBLEM_SELECT}`,
        [problemId, ctx.tenantId, patientId, status],
      );
      const row = rows[0];
      if (!row) throw AppError.notFound('Problema');
      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'patient.problem.update',
        entitySchema: 'registry',
        entityTable: 'patient_problems',
        entityId: problemId,
        after: { status },
      });
      return toProblem(row);
    });
  }

  // --------------------------------------------------- resumo do paciente
  /**
   * O que o veterinário precisa ver antes de começar a escrever: problemas em
   * aberto, o que o animal está tomando, o que foi decidido na última consulta
   * e o que está vencendo. Uma requisição só, para a tela abrir rápido no 4G.
   */
  async patientSummary(
    ctx: RequestContext,
    patientId: string,
    params: { excludeEncounterId?: string },
  ): Promise<PatientClinicalSummary> {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      await this.assertPatient(tx, ctx, patientId);
      const canReadSensitive = ctx.permissions.has('record:read_sensitive');
      const canReadPrescriptions = ctx.permissions.has('prescription:read');

      const problems = await tx.query<ProblemRow>(
        `SELECT ${PROBLEM_SELECT} FROM registry.patient_problems
          WHERE tenant_id = $1 AND patient_id = $2 AND status IN ('active','chronic')
          ORDER BY CASE status WHEN 'chronic' THEN 0 ELSE 1 END, created_at DESC`,
        [ctx.tenantId, patientId],
      );
      const medications = canReadPrescriptions
        ? await tx.query<{
            prescription_id: string;
            drug_name: string;
            dose_value: string | null;
            dose_uom: string | null;
            dose_per_kg: boolean;
            route: string | null;
            frequency_kind: string | null;
            frequency_value: string | null;
            duration_days: number | null;
            signed_at: Date;
            until: Date | null;
            continuous: boolean;
          }>(
            // "Uso contínuo" chega de dois jeitos: como frequência, ou como
            // intervalo definido mais a orientação "Uso contínuo", que é como
            // a receita guarda o intervalo sem perder a informação impressa.
            `SELECT p.id AS prescription_id, i.drug_name, i.dose_value::text AS dose_value, i.dose_uom,
                    i.dose_per_kg, i.route, i.frequency_kind, i.frequency_value::text AS frequency_value,
                    i.duration_days, COALESCE(p.signed_at, p.created_at) AS signed_at,
                    COALESCE(i.until_date, (COALESCE(p.signed_at, p.created_at) + make_interval(days => i.duration_days))::date) AS until,
                    (i.frequency_kind = 'continuous'
                      OR (i.duration_days IS NULL AND i.until_date IS NULL AND i.instructions ILIKE 'uso contínuo%')) AS continuous
               FROM clinical.prescription_items i
               JOIN clinical.prescriptions p ON p.id = i.prescription_id AND p.tenant_id = i.tenant_id
              WHERE p.tenant_id = $1 AND p.patient_id = $2 AND p.status = 'signed'
                AND COALESCE(p.signed_at, p.created_at) > now() - interval '365 days'
                AND (
                  i.frequency_kind = 'continuous'
                  OR (i.duration_days IS NULL AND i.until_date IS NULL AND i.instructions ILIKE 'uso contínuo%')
                  OR i.until_date >= CURRENT_DATE
                  OR (i.duration_days IS NOT NULL
                      AND (COALESCE(p.signed_at, p.created_at) + make_interval(days => i.duration_days))::date >= CURRENT_DATE)
                )
              ORDER BY COALESCE(p.signed_at, p.created_at) DESC, i.seq
              LIMIT 15`,
            [ctx.tenantId, patientId],
          )
        : { rows: [] };
      const last = await tx.query<{
        id: string;
        occurred_at: Date;
        service_name: string | null;
        professional_name: string | null;
        diagnosis_summary: string | null;
        plan: string | null;
      }>(
        `SELECT e.id, COALESCE(e.ended_at, e.started_at, e.arrived_at, e.created_at) AS occurred_at,
                sc.name AS service_name, pr.name AS professional_name,
                e.primary_diagnosis_summary AS diagnosis_summary,
                (SELECT n.body FROM clinical.encounter_notes n
                  WHERE n.tenant_id = e.tenant_id AND n.encounter_id = e.id AND n.kind = 'plan'
                    AND n.superseded_by_note_id IS NULL AND n.status IN ('final','amended','draft')
                  ORDER BY n.version DESC LIMIT 1) AS plan
           FROM clinical.encounters e
           LEFT JOIN registry.service_catalog sc ON sc.id = e.service_id AND sc.tenant_id = e.tenant_id
           LEFT JOIN registry.professionals pr ON pr.id = e.attending_professional_id AND pr.tenant_id = e.tenant_id
          WHERE e.tenant_id = $1 AND e.patient_id = $2 AND e.status = 'finished'
            AND ($3::uuid IS NULL OR e.id <> $3)
          ORDER BY COALESCE(e.ended_at, e.created_at) DESC
          LIMIT 1`,
        [ctx.tenantId, patientId, params.excludeEncounterId ?? null],
      );
      const count = await tx.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM clinical.encounters
          WHERE tenant_id = $1 AND patient_id = $2 AND status = 'finished'`,
        [ctx.tenantId, patientId],
      );
      const due = await tx.query<{ kind: string; name: string; due_at: Date }>(
        `SELECT * FROM (
           SELECT 'vaccine' AS kind, i.vaccine_name AS name, i.next_due_at AS due_at
             FROM immunization.immunizations i
            WHERE i.tenant_id = $1 AND i.patient_id = $2 AND i.status = 'completed' AND i.next_due_at IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM immunization.immunizations later
                 WHERE later.tenant_id = i.tenant_id AND later.patient_id = i.patient_id
                   AND lower(later.vaccine_name) = lower(i.vaccine_name) AND later.status = 'completed'
                   AND later.administered_at > i.administered_at)
           UNION ALL
           SELECT 'preventive' AS kind, t.product_name AS name, t.next_due_at AS due_at
             FROM immunization.preventive_treatments t
            WHERE t.tenant_id = $1 AND t.patient_id = $2 AND t.status = 'completed' AND t.next_due_at IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM immunization.preventive_treatments later
                 WHERE later.tenant_id = t.tenant_id AND later.patient_id = t.patient_id
                   AND lower(later.product_name) = lower(t.product_name) AND later.status = 'completed'
                   AND later.administered_at > t.administered_at)
         ) due
         WHERE due_at <= CURRENT_DATE + 30
         ORDER BY due_at
         LIMIT 10`,
        [ctx.tenantId, patientId],
      );

      await this.audit.recordAccess(tx, ctx, { resource: 'record', patientId, resourceId: patientId, purpose: 'summary' });

      const today = new Date().toISOString().slice(0, 10);
      // O mesmo medicamento renovado em receitas seguidas aparece uma vez só,
      // pela receita mais recente (a consulta já vem ordenada assim).
      const seenDrugs = new Set<string>();
      const latestPerDrug = medications.rows.filter((row) => {
        const key = normalizeIngredient(row.drug_name);
        if (seenDrugs.has(key)) return false;
        seenDrugs.add(key);
        return true;
      });
      const activeMedications: ActiveMedication[] = latestPerDrug.map((row) => {
        const unit = parseDoseUom(row.dose_uom);
        const unitLabel = unit.uom ? doseUnitLabel(unit.uom) : (row.dose_uom ?? '');
        const perKg = row.dose_per_kg || unit.perKg;
        const dose = row.dose_value ? `${formatDecimal(row.dose_value)} ${unitLabel}${perKg ? '/kg' : ''}`.trim() : null;
        const parts = [
          dose,
          row.route ? ROUTE_SHORT[row.route] ?? null : null,
          frequencyLabel(row.frequency_kind as FrequencyKind | null, row.frequency_value ? Number(row.frequency_value) : null),
          durationLabel(row.duration_days),
        ].filter((part): part is string => Boolean(part));
        const continuous = row.continuous;
        return {
          prescriptionId: row.prescription_id,
          drugName: row.drug_name,
          posology: parts.join(' · '),
          prescribedAt: row.signed_at.toISOString(),
          until: continuous || !row.until ? null : row.until.toISOString().slice(0, 10),
          continuous,
        };
      });

      const lastRow = last.rows[0];
      return {
        patientId,
        problems: problems.rows.map(toProblem),
        activeMedications,
        lastEncounter: lastRow
          ? {
              id: lastRow.id,
              occurredAt: lastRow.occurred_at.toISOString(),
              serviceName: lastRow.service_name,
              professionalName: lastRow.professional_name,
              diagnosisSummary: canReadSensitive ? lastRow.diagnosis_summary : null,
              plan: canReadSensitive ? lastRow.plan : null,
            }
          : null,
        dueImmunizations: due.rows.map((row) => {
          const dueAt = row.due_at.toISOString().slice(0, 10);
          return { kind: row.kind as 'vaccine' | 'preventive', name: row.name, dueAt, overdue: dueAt < today };
        }),
        encounterCount: count.rows[0]?.total ?? 0,
        redacted: !canReadSensitive,
      };
    });
  }

  // ------------------------------------------------- receita: sugestões
  /**
   * O que a clínica já prescreveu, com a posologia da última vez. Prioriza a
   * mesma espécie do paciente e o que é mais usado. Não há bulário de
   * terceiros aqui: a dose sugerida é sempre a que um veterinário da própria
   * clínica assinou antes, e continua precisando de conferência.
   */
  async medicationSuggestions(
    ctx: RequestContext,
    params: { q: string; speciesId?: string; limit: number },
  ): Promise<{ items: MedicationSuggestion[] }> {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const pattern = params.q ? `%${params.q.replace(/[%_\\]/g, (char) => `\\${char}`)}%` : null;
      const { rows } = await tx.query<{
        drug_name: string;
        active_ingredient: string | null;
        concentration: string | null;
        dose_value: string | null;
        dose_uom: string | null;
        dose_per_kg: boolean;
        route: string | null;
        frequency_kind: string | null;
        frequency_value: string | null;
        duration_days: number | null;
        quantity_uom: string | null;
        instructions: string | null;
        is_controlled: boolean;
        withdrawal_meat_days: number | null;
        withdrawal_milk_days: number | null;
        times_used: number;
        same_species: boolean;
      }>(
        `SELECT * FROM (
           SELECT DISTINCT ON (lower(i.drug_name))
                  i.drug_name, i.active_ingredient, i.concentration_uom AS concentration,
                  i.dose_value::text AS dose_value, i.dose_uom, i.dose_per_kg, i.route,
                  i.frequency_kind, i.frequency_value::text AS frequency_value, i.duration_days,
                  i.quantity_uom, i.instructions, i.is_controlled, i.withdrawal_meat_days, i.withdrawal_milk_days,
                  (count(*) OVER (PARTITION BY lower(i.drug_name)))::int AS times_used,
                  COALESCE(pa.species_id = $3, false) AS same_species
             FROM clinical.prescription_items i
             JOIN clinical.prescriptions p ON p.id = i.prescription_id AND p.tenant_id = i.tenant_id
             JOIN registry.patients pa ON pa.id = p.patient_id AND pa.tenant_id = p.tenant_id
            WHERE i.tenant_id = $1 AND p.status = 'signed'
              AND ($2::text IS NULL OR i.drug_name ILIKE $2 OR i.active_ingredient ILIKE $2)
            ORDER BY lower(i.drug_name), COALESCE(pa.species_id = $3, false) DESC, p.created_at DESC
         ) s
         ORDER BY same_species DESC, times_used DESC, drug_name
         LIMIT $4`,
        [ctx.tenantId, pattern, params.speciesId ?? null, params.limit],
      );

      // Decimais saem sem zeros à direita ("1", não "1.0000"), e unidade
      // gravada fora do vocabulário da receita é traduzida ("mg/kg" vira mg
      // por quilo) para a sugestão nunca preencher um campo com valor inválido.
      const trimDecimal = (value: string | null) => (value == null ? null : String(Number(value)));
      return {
        items: rows.map((row) => {
          const unit = parseDoseUom(row.dose_uom);
          return {
            drugName: row.drug_name,
            activeIngredient: row.active_ingredient,
            concentration: row.concentration,
            doseValue: trimDecimal(row.dose_value),
            doseUom: unit.uom,
            dosePerKg: row.dose_per_kg || unit.perKg,
            route: row.route as MedicationSuggestion['route'],
            frequencyKind: row.frequency_kind as MedicationSuggestion['frequencyKind'],
            frequencyValue: trimDecimal(row.frequency_value),
            durationDays: row.duration_days,
            quantityUom: row.quantity_uom,
            instructions: row.instructions,
            isControlled: row.is_controlled,
            withdrawalMeatDays: row.withdrawal_meat_days,
            withdrawalMilkDays: row.withdrawal_milk_days,
            timesUsed: row.times_used,
            sameSpecies: row.same_species,
          };
        }),
      };
    });
  }

  async listPrescriptionTemplates(
    ctx: RequestContext,
    params: { speciesId?: string },
  ): Promise<{ items: PrescriptionTemplate[] }> {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query<{
        id: string;
        name: string;
        species_id: string | null;
        items: PrescriptionTemplate['items'];
        created_at: Date;
      }>(
        `SELECT id, name, species_id, items, created_at FROM clinical.prescription_templates
          WHERE tenant_id = $1 AND ($2::uuid IS NULL OR species_id IS NULL OR species_id = $2)
          ORDER BY name`,
        [ctx.tenantId, params.speciesId ?? null],
      );
      return {
        items: rows.map((row) => ({
          id: row.id,
          name: row.name,
          speciesId: row.species_id,
          items: row.items,
          createdAt: row.created_at.toISOString(),
        })),
      };
    });
  }

  async createPrescriptionTemplate(ctx: RequestContext, input: CreatePrescriptionTemplate): Promise<PrescriptionTemplate> {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const id = uuidv7();
      const { rows } = await tx.query<{ created_at: Date }>(
        `INSERT INTO clinical.prescription_templates (id, tenant_id, name, species_id, items)
         VALUES ($1,$2,$3,$4,$5) RETURNING created_at`,
        [id, ctx.tenantId, input.name, input.speciesId ?? null, JSON.stringify(input.items)],
      );
      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'prescription_template.create',
        entitySchema: 'clinical',
        entityTable: 'prescription_templates',
        entityId: id,
        after: { items: input.items.length },
      });
      return {
        id,
        name: input.name,
        speciesId: input.speciesId ?? null,
        items: input.items,
        createdAt: (rows[0]?.created_at ?? new Date()).toISOString(),
      };
    });
  }

  async removePrescriptionTemplate(ctx: RequestContext, id: string): Promise<void> {
    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const result = await tx.query(`DELETE FROM clinical.prescription_templates WHERE id = $1 AND tenant_id = $2`, [
        id,
        ctx.tenantId,
      ]);
      if (!result.rowCount) throw AppError.notFound('Protocolo de receita');
      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'prescription_template.remove',
        entitySchema: 'clinical',
        entityTable: 'prescription_templates',
        entityId: id,
      });
    });
  }

  // ---------------------------------------------------- vacinas: protocolos
  /**
   * Protocolos da espécie do paciente já resolvidos: qual dose cabe agora, a
   * data sugerida da próxima e o lote que a clínica está usando (o mais
   * recente ainda dentro da validade). É o que transforma nove campos em um
   * toque no nome da vacina.
   */
  async protocolSuggestions(ctx: RequestContext, patientId: string): Promise<{ items: PatientProtocolSuggestion[] }> {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const patient = await this.assertPatient(tx, ctx, patientId);
      const { rows } = await tx.query<{
        id: string;
        name: string;
        kind: string;
        species_id: string | null;
        steps: Array<{ label: string; intervalToNextDays: number | null }>;
        booster_interval_days: number | null;
        doses_given: number;
        last_applied_at: Date | null;
        lot_manufacturer: string | null;
        lot_number: string | null;
        lot_expires_at: Date | null;
      }>(
        `SELECT pr.id, pr.name, pr.kind, pr.species_id, pr.steps, pr.booster_interval_days,
                hist.doses_given, hist.last_applied_at,
                lot.manufacturer AS lot_manufacturer, lot.lot_number, lot.expires_at AS lot_expires_at
           FROM immunization.protocols pr
           LEFT JOIN LATERAL (
             SELECT count(*)::int AS doses_given, max(i.administered_at) AS last_applied_at
               FROM immunization.immunizations i
              WHERE i.tenant_id = $1 AND i.patient_id = $2 AND i.status = 'completed'
                AND (i.protocol_id = pr.id OR lower(i.vaccine_name) = lower(pr.name))
           ) hist ON true
           LEFT JOIN LATERAL (
             SELECT i.manufacturer, i.lot_number, i.expires_at
               FROM immunization.immunizations i
              WHERE i.tenant_id = $1 AND i.status = 'completed' AND i.lot_number IS NOT NULL
                AND NOT i.administered_elsewhere -- lote de outra clínica não é o frasco em uso aqui
                AND (i.protocol_id = pr.id OR lower(i.vaccine_name) = lower(pr.name))
                AND (i.expires_at IS NULL OR i.expires_at >= CURRENT_DATE)
              ORDER BY i.administered_at DESC
              LIMIT 1
           ) lot ON true
          WHERE pr.active AND (pr.tenant_id IS NULL OR pr.tenant_id = $1)
            AND (pr.species_id IS NULL OR pr.species_id = $3)
          ORDER BY (hist.doses_given > 0) DESC, pr.name`,
        [ctx.tenantId, patientId, patient.species_id],
      );

      const today = new Date();
      return {
        items: rows.map((row) => {
          const next = nextDoseFor({ steps: row.steps, boosterIntervalDays: row.booster_interval_days }, row.doses_given);
          return {
            id: row.id,
            name: row.name,
            kind: row.kind as PatientProtocolSuggestion['kind'],
            speciesId: row.species_id,
            steps: row.steps,
            boosterIntervalDays: row.booster_interval_days,
            dosesGiven: row.doses_given,
            nextDoseNumber: next.doseNumber,
            nextDoseLabel: next.label,
            suggestedNextDueAt: next.nextIntervalDays != null ? addDaysIso(today, next.nextIntervalDays) : null,
            lastAppliedAt: row.last_applied_at?.toISOString() ?? null,
            lot:
              row.lot_number || row.lot_manufacturer
                ? {
                    manufacturer: row.lot_manufacturer,
                    lotNumber: row.lot_number,
                    expiresAt: row.lot_expires_at ? row.lot_expires_at.toISOString().slice(0, 10) : null,
                  }
                : null,
          };
        }),
      };
    });
  }

  private async assertPatient(tx: PoolClient, ctx: RequestContext, patientId: string) {
    const { rows } = await tx.query<{ id: string; species_id: string }>(
      `SELECT id, species_id FROM registry.patients WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [patientId, ctx.tenantId],
    );
    const patient = rows[0];
    if (!patient) throw AppError.notFound('Paciente');
    return patient;
  }
}
