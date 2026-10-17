import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type {
  CreateImmunization,
  CreatePreventiveTreatment,
  DueItem,
  Immunization,
  PreventiveTreatment,
  UpdateImmunization,
  UpdatePreventiveTreatment,
} from '@chiron/contracts';
import { DatabaseService } from '../../database/database.service';
import { AuditService } from '../../common/audit.service';
import { AppError } from '../../common/errors';
import { uuidv7 } from '../../common/uuid';
import type { RequestContext } from '../../common/request-context';
import { contextToTenantContext } from '../../common/request-context';

interface ImmunizationRow {
  id: string;
  patient_id: string;
  patient_name: string;
  encounter_id: string | null;
  vaccine_name: string;
  manufacturer: string | null;
  lot_number: string | null;
  expires_at: Date | null;
  administered_at: Date;
  professional_name: string | null;
  route: string | null;
  site: string | null;
  dose_number: number | null;
  next_due_at: Date | null;
  status: string;
  reaction_notes: string | null;
  document_id: string | null;
  administered_elsewhere: boolean;
  external_location: string | null;
  external_professional: string | null;
  cancel_reason: string | null;
  cancelled_at: Date | null;
}

interface PreventiveRow {
  id: string;
  patient_id: string;
  patient_name: string;
  encounter_id: string | null;
  kind: string;
  product_name: string;
  lot_number: string | null;
  administered_at: Date;
  professional_name: string | null;
  dose_text: string | null;
  next_due_at: Date | null;
  notes: string | null;
  status: string;
  administered_elsewhere: boolean;
  external_location: string | null;
  external_professional: string | null;
  cancel_reason: string | null;
  cancelled_at: Date | null;
}

const IMMUNIZATION_SELECT = `
  SELECT i.id, i.patient_id, p.name AS patient_name, i.encounter_id, i.vaccine_name, i.manufacturer,
         i.lot_number, i.expires_at, i.administered_at, pr.name AS professional_name, i.route, i.site,
         i.dose_number, i.next_due_at, i.status, i.reaction_notes, i.document_id,
         i.administered_elsewhere, i.external_location, i.external_professional,
         i.cancel_reason, i.cancelled_at
    FROM immunization.immunizations i
    JOIN registry.patients p ON p.id = i.patient_id AND p.tenant_id = i.tenant_id
    LEFT JOIN registry.professionals pr ON pr.id = i.professional_id AND pr.tenant_id = i.tenant_id`;

const PREVENTIVE_SELECT = `
  SELECT t.id, t.patient_id, p.name AS patient_name, t.encounter_id, t.kind, t.product_name,
         t.lot_number, t.administered_at, pr.name AS professional_name, t.dose_text,
         t.next_due_at, t.notes, t.status,
         t.administered_elsewhere, t.external_location, t.external_professional,
         t.cancel_reason, t.cancelled_at
    FROM immunization.preventive_treatments t
    JOIN registry.patients p ON p.id = t.patient_id AND p.tenant_id = t.tenant_id
    LEFT JOIN registry.professionals pr ON pr.id = t.professional_id AND pr.tenant_id = t.tenant_id`;

/**
 * Campo corrigível: coluna, tipo SQL e se é texto livre. Texto livre (notas,
 * nome de quem aplicou fora) não vai em claro para a auditoria, que guarda só
 * o nome do campo alterado; o resto vai com antes e depois.
 */
interface EditableField {
  column: string;
  cast: 'text' | 'int' | 'date' | 'timestamptz';
  freeText?: boolean;
}

const IMMUNIZATION_EDITABLE: Record<keyof UpdateImmunization, EditableField> = {
  administeredAt: { column: 'administered_at', cast: 'timestamptz' },
  doseNumber: { column: 'dose_number', cast: 'int' },
  manufacturer: { column: 'manufacturer', cast: 'text' },
  lotNumber: { column: 'lot_number', cast: 'text' },
  expiresAt: { column: 'expires_at', cast: 'date' },
  nextDueAt: { column: 'next_due_at', cast: 'date' },
  reactionNotes: { column: 'reaction_notes', cast: 'text', freeText: true },
  externalLocation: { column: 'external_location', cast: 'text', freeText: true },
  externalProfessional: { column: 'external_professional', cast: 'text', freeText: true },
};

const PREVENTIVE_EDITABLE: Record<keyof UpdatePreventiveTreatment, EditableField> = {
  administeredAt: { column: 'administered_at', cast: 'timestamptz' },
  lotNumber: { column: 'lot_number', cast: 'text' },
  doseText: { column: 'dose_text', cast: 'text' },
  nextDueAt: { column: 'next_due_at', cast: 'date' },
  notes: { column: 'notes', cast: 'text', freeText: true },
  externalLocation: { column: 'external_location', cast: 'text', freeText: true },
  externalProfessional: { column: 'external_professional', cast: 'text', freeText: true },
};

const EXTERNAL_KEYS = ['externalLocation', 'externalProfessional'] as const;

/** Tolerância para relógio de celular adiantado ao validar "data no futuro". */
const CLOCK_SKEW_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function isoDate(value: Date | null): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

/** Texto vazio é ausência: "" no lote apaga o lote, não grava lote vazio. */
function blankToNull<T>(value: T): T | null {
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
}

function sameValue(a: unknown, b: unknown, cast: EditableField['cast']): boolean {
  if (a === null || b === null) return a === b;
  if (cast === 'timestamptz') return new Date(String(a)).getTime() === new Date(String(b)).getTime();
  return a === b;
}

/**
 * Vacinas e preventivos. Registro é fato clínico: não se apaga, se marca
 * como `entered_in_error` com motivo. A próxima dose alimenta o painel de
 * pendências e a carteira em PDF (módulo de documentos); registro cancelado
 * sai dos dois.
 */
@Injectable()
export class ImmunizationService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  private toImmunization(row: ImmunizationRow): Immunization {
    return {
      id: row.id,
      patientId: row.patient_id,
      patientName: row.patient_name,
      encounterId: row.encounter_id,
      vaccineName: row.vaccine_name,
      manufacturer: row.manufacturer,
      lotNumber: row.lot_number,
      expiresAt: isoDate(row.expires_at),
      administeredAt: row.administered_at.toISOString(),
      professionalName: row.professional_name,
      route: row.route as Immunization['route'],
      site: row.site,
      doseNumber: row.dose_number,
      nextDueAt: isoDate(row.next_due_at),
      status: row.status as Immunization['status'],
      reactionNotes: row.reaction_notes,
      documentId: row.document_id,
      administeredElsewhere: row.administered_elsewhere,
      externalLocation: row.external_location,
      externalProfessional: row.external_professional,
      cancelReason: row.cancel_reason,
      cancelledAt: row.cancelled_at?.toISOString() ?? null,
    };
  }

  private toPreventive(row: PreventiveRow): PreventiveTreatment {
    return {
      id: row.id,
      patientId: row.patient_id,
      patientName: row.patient_name,
      encounterId: row.encounter_id,
      kind: row.kind as PreventiveTreatment['kind'],
      productName: row.product_name,
      lotNumber: row.lot_number,
      administeredAt: row.administered_at.toISOString(),
      professionalName: row.professional_name,
      doseText: row.dose_text,
      nextDueAt: isoDate(row.next_due_at),
      notes: row.notes,
      status: row.status as PreventiveTreatment['status'],
      administeredElsewhere: row.administered_elsewhere,
      externalLocation: row.external_location,
      externalProfessional: row.external_professional,
      cancelReason: row.cancel_reason,
      cancelledAt: row.cancelled_at?.toISOString() ?? null,
    };
  }

  async list(
    ctx: RequestContext,
    params: { patientId?: string; encounterId?: string; limit: number },
  ): Promise<{ immunizations: Immunization[]; preventives: PreventiveTreatment[] }> {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const immunizations = await tx.query<ImmunizationRow>(
        `${IMMUNIZATION_SELECT}
          WHERE i.tenant_id = $1
            AND ($2::uuid IS NULL OR i.patient_id = $2)
            AND ($3::uuid IS NULL OR i.encounter_id = $3)
          ORDER BY i.administered_at DESC
          LIMIT $4`,
        [ctx.tenantId, params.patientId ?? null, params.encounterId ?? null, params.limit],
      );

      const preventives = await tx.query<PreventiveRow>(
        `${PREVENTIVE_SELECT}
          WHERE t.tenant_id = $1
            AND ($2::uuid IS NULL OR t.patient_id = $2)
            AND ($3::uuid IS NULL OR t.encounter_id = $3)
          ORDER BY t.administered_at DESC
          LIMIT $4`,
        [ctx.tenantId, params.patientId ?? null, params.encounterId ?? null, params.limit],
      );

      return {
        immunizations: immunizations.rows.map((r) => this.toImmunization(r)),
        preventives: preventives.rows.map((r) => this.toPreventive(r)),
      };
    });
  }

  async apply(ctx: RequestContext, input: CreateImmunization): Promise<Immunization> {
    const elsewhere = input.administeredElsewhere === true;
    this.assertDates({ administeredAt: input.administeredAt, nextDueAt: input.nextDueAt, elsewhere });
    if (elsewhere && input.encounterId) {
      throw AppError.validation('Dose aplicada em outro local não entra em atendimento: registre pela ficha do paciente.');
    }

    const id = await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      await this.assertPatientOpen(tx, ctx, input.patientId, input.encounterId);

      const immunizationId = uuidv7();
      await tx.query(
        `INSERT INTO immunization.immunizations
           (id, tenant_id, patient_id, encounter_id, vaccine_name, manufacturer, lot_number, expires_at,
            administered_at, professional_id, administered_by_user_id, route, site, dose_number,
            next_due_at, status, reaction_notes, protocol_id,
            administered_elsewhere, external_location, external_professional)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8, COALESCE($9::timestamptz, now()), $10,$11,$12,$13,$14,$15,'completed',$16,$17,
                 $18,$19,$20)`,
        [
          immunizationId,
          ctx.tenantId,
          input.patientId,
          input.encounterId ?? null,
          input.vaccineName,
          blankToNull(input.manufacturer ?? null),
          blankToNull(input.lotNumber ?? null),
          input.expiresAt ?? null,
          input.administeredAt ?? null,
          // Dose de fora não foi aplicada por ninguém da casa: quem transcreveu fica na auditoria.
          elsewhere ? null : ctx.professionalId,
          elsewhere ? null : ctx.user.id,
          input.route ?? null,
          blankToNull(input.site ?? null),
          input.doseNumber ?? null,
          input.nextDueAt ?? null,
          blankToNull(input.reactionNotes ?? null),
          input.protocolId ?? null,
          elsewhere,
          elsewhere ? blankToNull(input.externalLocation ?? null) : null,
          elsewhere ? blankToNull(input.externalProfessional ?? null) : null,
        ],
      );

      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'immunization.apply',
        entitySchema: 'immunization',
        entityTable: 'immunizations',
        entityId: immunizationId,
        after: {
          patientId: input.patientId,
          encounterId: input.encounterId ?? null,
          vaccineName: input.vaccineName,
          administeredElsewhere: elsewhere,
          nextDueAt: input.nextDueAt ?? null,
        },
      });
      await this.audit.publish(tx, ctx, {
        aggregateTable: 'immunization.immunizations',
        aggregateId: immunizationId,
        eventType: 'immunization.applied',
        payload: { patientId: input.patientId, nextDueAt: input.nextDueAt ?? null, administeredElsewhere: elsewhere },
      });

      return immunizationId;
    });

    return this.getImmunization(ctx, id);
  }

  async getImmunization(ctx: RequestContext, id: string): Promise<Immunization> {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query<ImmunizationRow>(`${IMMUNIZATION_SELECT} WHERE i.tenant_id = $1 AND i.id = $2`, [
        ctx.tenantId,
        id,
      ]);
      const row = rows[0];
      if (!row) throw AppError.notFound('Registro de vacina');
      return this.toImmunization(row);
    });
  }

  /** Correção de lote, data, próxima dose e notas, com antes e depois na auditoria. */
  async updateImmunization(ctx: RequestContext, id: string, input: UpdateImmunization): Promise<Immunization> {
    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query<ImmunizationRow>(
        `${IMMUNIZATION_SELECT} WHERE i.tenant_id = $1 AND i.id = $2 FOR UPDATE OF i`,
        [ctx.tenantId, id],
      );
      const row = rows[0];
      if (!row) throw AppError.notFound('Registro de vacina');
      const current = this.toImmunization(row);

      await this.correct(tx, ctx, {
        table: 'immunizations',
        action: 'immunization.update',
        id,
        fields: IMMUNIZATION_EDITABLE,
        current: current as unknown as Record<string, unknown>,
        input: input as Record<string, unknown>,
      });
    });

    return this.getImmunization(ctx, id);
  }

  /**
   * Cancelamento é marcação de erro: o registro permanece no histórico, sai
   * das pendências e da carteira, e a cobrança ainda pendente dele é cancelada.
   */
  async cancelImmunization(ctx: RequestContext, id: string, reason: string): Promise<Immunization> {
    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query<{ status: string; next_due_at: Date | null }>(
        `SELECT status, next_due_at FROM immunization.immunizations WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [id, ctx.tenantId],
      );
      const row = rows[0];
      if (!row) throw AppError.notFound('Registro de vacina');
      if (row.status === 'entered_in_error') throw AppError.conflict('Este registro já foi cancelado.');

      await tx.query(
        `UPDATE immunization.immunizations
            SET status = 'entered_in_error', cancel_reason = $3, cancelled_at = now(), cancelled_by_user_id = $4
          WHERE id = $1 AND tenant_id = $2`,
        [id, ctx.tenantId, reason, ctx.user.id],
      );

      const charges = await tx.query(
        `UPDATE billing.charge_items SET status = 'cancelled'
          WHERE tenant_id = $1 AND source_table = 'immunization.immunizations' AND source_id = $2
            AND status = 'pending'`,
        [ctx.tenantId, id],
      );

      await this.audit.record(tx, ctx, {
        category: 'cancel',
        action: 'immunization.cancel',
        entitySchema: 'immunization',
        entityTable: 'immunizations',
        entityId: id,
        before: { status: row.status, nextDueAt: isoDate(row.next_due_at) },
        after: { status: 'entered_in_error', chargeItemsCancelled: charges.rowCount ?? 0 },
        reason,
      });
    });

    return this.getImmunization(ctx, id);
  }

  async recordPreventive(ctx: RequestContext, input: CreatePreventiveTreatment): Promise<PreventiveTreatment> {
    const elsewhere = input.administeredElsewhere === true;
    this.assertDates({ administeredAt: input.administeredAt, nextDueAt: input.nextDueAt, elsewhere });
    if (elsewhere && input.encounterId) {
      throw AppError.validation('Dose aplicada em outro local não entra em atendimento: registre pela ficha do paciente.');
    }

    const id = await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      await this.assertPatientOpen(tx, ctx, input.patientId, input.encounterId);

      const treatmentId = uuidv7();
      await tx.query(
        `INSERT INTO immunization.preventive_treatments
           (id, tenant_id, patient_id, encounter_id, kind, product_name, lot_number, administered_at,
            professional_id, administered_by_user_id, dose_text, next_due_at, notes,
            administered_elsewhere, external_location, external_professional)
         VALUES ($1,$2,$3,$4,$5,$6,$7, COALESCE($8::timestamptz, now()), $9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          treatmentId,
          ctx.tenantId,
          input.patientId,
          input.encounterId ?? null,
          input.kind,
          input.productName,
          blankToNull(input.lotNumber ?? null),
          input.administeredAt ?? null,
          elsewhere ? null : ctx.professionalId,
          elsewhere ? null : ctx.user.id,
          blankToNull(input.doseText ?? null),
          input.nextDueAt ?? null,
          blankToNull(input.notes ?? null),
          elsewhere,
          elsewhere ? blankToNull(input.externalLocation ?? null) : null,
          elsewhere ? blankToNull(input.externalProfessional ?? null) : null,
        ],
      );

      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'preventive.record',
        entitySchema: 'immunization',
        entityTable: 'preventive_treatments',
        entityId: treatmentId,
        after: {
          patientId: input.patientId,
          encounterId: input.encounterId ?? null,
          kind: input.kind,
          administeredElsewhere: elsewhere,
          nextDueAt: input.nextDueAt ?? null,
        },
      });

      return treatmentId;
    });

    return this.getPreventive(ctx, id);
  }

  async getPreventive(ctx: RequestContext, id: string): Promise<PreventiveTreatment> {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query<PreventiveRow>(`${PREVENTIVE_SELECT} WHERE t.tenant_id = $1 AND t.id = $2`, [
        ctx.tenantId,
        id,
      ]);
      const row = rows[0];
      if (!row) throw AppError.notFound('Registro de preventivo');
      return this.toPreventive(row);
    });
  }

  async updatePreventive(
    ctx: RequestContext,
    id: string,
    input: UpdatePreventiveTreatment,
  ): Promise<PreventiveTreatment> {
    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query<PreventiveRow>(
        `${PREVENTIVE_SELECT} WHERE t.tenant_id = $1 AND t.id = $2 FOR UPDATE OF t`,
        [ctx.tenantId, id],
      );
      const row = rows[0];
      if (!row) throw AppError.notFound('Registro de preventivo');
      const current = this.toPreventive(row);

      await this.correct(tx, ctx, {
        table: 'preventive_treatments',
        action: 'preventive.update',
        id,
        fields: PREVENTIVE_EDITABLE,
        current: current as unknown as Record<string, unknown>,
        input: input as Record<string, unknown>,
      });
    });

    return this.getPreventive(ctx, id);
  }

  async cancelPreventive(ctx: RequestContext, id: string, reason: string): Promise<PreventiveTreatment> {
    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query<{ status: string; next_due_at: Date | null }>(
        `SELECT status, next_due_at FROM immunization.preventive_treatments
          WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [id, ctx.tenantId],
      );
      const row = rows[0];
      if (!row) throw AppError.notFound('Registro de preventivo');
      if (row.status === 'entered_in_error') throw AppError.conflict('Este registro já foi cancelado.');

      await tx.query(
        `UPDATE immunization.preventive_treatments
            SET status = 'entered_in_error', cancel_reason = $3, cancelled_at = now(), cancelled_by_user_id = $4
          WHERE id = $1 AND tenant_id = $2`,
        [id, ctx.tenantId, reason, ctx.user.id],
      );

      await this.audit.record(tx, ctx, {
        category: 'cancel',
        action: 'preventive.cancel',
        entitySchema: 'immunization',
        entityTable: 'preventive_treatments',
        entityId: id,
        before: { status: row.status, nextDueAt: isoDate(row.next_due_at) },
        after: { status: 'entered_in_error' },
        reason,
      });
    });

    return this.getPreventive(ctx, id);
  }

  /**
   * Pendências: doses vencidas ou a vencer até a data informada. Uma dose
   * posterior do mesmo produto (inclusive aplicada em outro local) quita a
   * anterior; registro cancelado não conta nem como pendência nem como quitação.
   */
  async listDue(ctx: RequestContext, until: string | undefined, limit: number): Promise<{ items: DueItem[] }> {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query<{
        kind: string;
        id: string;
        patient_id: string;
        patient_name: string;
        guardian_name: string | null;
        guardian_phone: string | null;
        product_name: string;
        preventive_kind: string | null;
        due_at: Date;
      }>(
        `WITH horizon AS (SELECT COALESCE($2::date, CURRENT_DATE + INTERVAL '30 days')::date AS until)
         SELECT * FROM (
           SELECT 'vaccine' AS kind, i.id, i.patient_id, p.name AS patient_name,
                  g.name AS guardian_name, g.phone_primary AS guardian_phone,
                  i.vaccine_name AS product_name, NULL::text AS preventive_kind, i.next_due_at AS due_at
             FROM immunization.immunizations i
             JOIN registry.patients p ON p.id = i.patient_id AND p.tenant_id = i.tenant_id
             LEFT JOIN LATERAL (
               SELECT gu.name, gu.phone_primary FROM registry.patient_guardians pg
                 JOIN registry.guardians gu ON gu.id = pg.guardian_id AND gu.tenant_id = pg.tenant_id
                WHERE pg.patient_id = p.id AND pg.tenant_id = p.tenant_id AND pg.valid_to IS NULL
                ORDER BY pg.is_primary DESC LIMIT 1
             ) g ON true
            WHERE i.tenant_id = $1 AND i.status = 'completed' AND i.next_due_at IS NOT NULL
              AND i.next_due_at <= (SELECT until FROM horizon)
              AND p.status = 'active' AND p.deleted_at IS NULL
              AND NOT EXISTS (
                SELECT 1 FROM immunization.immunizations later
                 WHERE later.tenant_id = i.tenant_id AND later.patient_id = i.patient_id
                   AND later.vaccine_name = i.vaccine_name AND later.status = 'completed'
                   AND later.administered_at > i.administered_at)
           UNION ALL
           SELECT 'preventive' AS kind, t.id, t.patient_id, p.name AS patient_name,
                  g.name AS guardian_name, g.phone_primary AS guardian_phone,
                  t.product_name, t.kind AS preventive_kind, t.next_due_at AS due_at
             FROM immunization.preventive_treatments t
             JOIN registry.patients p ON p.id = t.patient_id AND p.tenant_id = t.tenant_id
             LEFT JOIN LATERAL (
               SELECT gu.name, gu.phone_primary FROM registry.patient_guardians pg
                 JOIN registry.guardians gu ON gu.id = pg.guardian_id AND gu.tenant_id = pg.tenant_id
                WHERE pg.patient_id = p.id AND pg.tenant_id = p.tenant_id AND pg.valid_to IS NULL
                ORDER BY pg.is_primary DESC LIMIT 1
             ) g ON true
            WHERE t.tenant_id = $1 AND t.status = 'completed' AND t.next_due_at IS NOT NULL
              AND t.next_due_at <= (SELECT until FROM horizon)
              AND p.status = 'active' AND p.deleted_at IS NULL
              AND NOT EXISTS (
                SELECT 1 FROM immunization.preventive_treatments later
                 WHERE later.tenant_id = t.tenant_id AND later.patient_id = t.patient_id
                   AND later.product_name = t.product_name AND later.status = 'completed'
                   AND later.administered_at > t.administered_at)
         ) due
         ORDER BY due_at
         LIMIT $3`,
        [ctx.tenantId, until ?? null, limit],
      );

      return {
        items: rows.map((r) => ({
          kind: r.kind as DueItem['kind'],
          id: r.id,
          patientId: r.patient_id,
          patientName: r.patient_name,
          guardianName: r.guardian_name,
          guardianPhone: r.guardian_phone,
          productName: r.product_name,
          preventiveKind: r.preventive_kind as DueItem['preventiveKind'],
          dueAt: r.due_at.toISOString().slice(0, 10),
        })),
      };
    });
  }

  /**
   * Aplica só o que mudou de fato e audita campo a campo. Pedido sem mudança
   * real não grava nada (nem auditoria), para "salvar de novo" não poluir o log.
   */
  private async correct(
    tx: PoolClient,
    ctx: RequestContext,
    params: {
      table: 'immunizations' | 'preventive_treatments';
      action: string;
      id: string;
      fields: Record<string, EditableField>;
      current: Record<string, unknown>;
      input: Record<string, unknown>;
    },
  ): Promise<void> {
    const { current, input, fields } = params;
    if (current.status === 'entered_in_error') {
      throw AppError.conflict('Registro cancelado não pode ser corrigido.');
    }
    const elsewhere = current.administeredElsewhere === true;
    if (!elsewhere && EXTERNAL_KEYS.some((key) => blankToNull(input[key] ?? null) !== null)) {
      throw AppError.validation('Local e profissional de fora só valem para dose aplicada em outro local.');
    }

    const sets: string[] = [];
    const values: unknown[] = [params.id, ctx.tenantId];
    const changed: string[] = [];
    const resulting: Record<string, unknown> = { ...current };
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};

    for (const [key, field] of Object.entries(fields)) {
      if (input[key] === undefined) continue;
      const next = blankToNull(input[key]);
      if (key === 'administeredAt' && next === null) continue;
      if (sameValue(current[key] ?? null, next, field.cast)) continue;

      values.push(next);
      sets.push(`${field.column} = $${values.length}::${field.cast}`);
      changed.push(key);
      resulting[key] = next;
      if (!field.freeText) {
        before[key] = current[key] ?? null;
        after[key] = next;
      }
    }

    if (changed.length === 0) return;

    if (changed.includes('administeredAt') || changed.includes('nextDueAt')) {
      this.assertDates({
        administeredAt: String(resulting.administeredAt),
        nextDueAt: (resulting.nextDueAt as string | null) ?? undefined,
        elsewhere,
      });
    }

    await tx.query(
      `UPDATE immunization.${params.table} SET ${sets.join(', ')} WHERE id = $1 AND tenant_id = $2`,
      values,
    );

    await this.audit.record(tx, ctx, {
      category: 'mutation',
      action: params.action,
      entitySchema: 'immunization',
      entityTable: params.table,
      entityId: params.id,
      before,
      after: { ...after, changedFields: changed },
    });
  }

  /**
   * Data de aplicação não pode estar no futuro (dose registrada antes da hora
   * vira pendência quitada sem vacina), e a dose de outro local precisa da data
   * da carteira, senão entraria como aplicada hoje.
   */
  private assertDates(params: { administeredAt?: string; nextDueAt?: string; elsewhere: boolean }): void {
    if (params.elsewhere && !params.administeredAt) {
      throw AppError.validation('Informe a data em que a dose foi aplicada.');
    }
    const administered = params.administeredAt ? new Date(params.administeredAt).getTime() : Date.now();
    if (administered > Date.now() + CLOCK_SKEW_MS) {
      throw AppError.validation('A data de aplicação não pode estar no futuro.');
    }
    // Um dia de folga cobre a diferença entre a data local e a UTC.
    if (params.nextDueAt && new Date(`${params.nextDueAt}T00:00:00Z`).getTime() + DAY_MS < administered) {
      throw AppError.validation('A próxima dose não pode ser anterior à aplicação.');
    }
  }

  private async assertPatientOpen(
    tx: PoolClient,
    ctx: RequestContext,
    patientId: string,
    encounterId?: string,
  ): Promise<void> {
    const patient = await tx.query<{ status: string }>(
      `SELECT status FROM registry.patients WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [patientId, ctx.tenantId],
    );
    if (!patient.rows[0]) throw AppError.notFound('Paciente');
    if (patient.rows[0].status === 'deceased') {
      throw AppError.conflict('Paciente com óbito registrado.');
    }

    if (encounterId) {
      const encounter = await tx.query<{ status: string; patient_id: string }>(
        `SELECT status, patient_id FROM clinical.encounters WHERE id = $1 AND tenant_id = $2`,
        [encounterId, ctx.tenantId],
      );
      const enc = encounter.rows[0];
      if (!enc) throw AppError.notFound('Atendimento');
      if (enc.patient_id !== patientId) {
        throw AppError.validation('O atendimento informado pertence a outro paciente.');
      }
      if (enc.status === 'finished' || enc.status === 'cancelled' || enc.status === 'entered_in_error') {
        throw new AppError('ENCOUNTER_LOCKED', 'Atendimento finalizado: reabra antes de registrar aplicações.');
      }
    }
  }
}
