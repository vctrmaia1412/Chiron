import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type {
  CreateImmunization,
  DueItem,
  Immunization,
  PreventiveTreatment,
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
}

function isoDate(value: Date | null): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

/**
 * Vacinas e preventivos. Registro é fato clínico: não se apaga, se marca
 * como `entered_in_error`. A próxima dose alimenta o painel de pendências
 * e a carteira em PDF (módulo de documentos).
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
    };
  }

  async list(
    ctx: RequestContext,
    params: { patientId?: string; encounterId?: string; limit: number },
  ): Promise<{ immunizations: Immunization[]; preventives: PreventiveTreatment[] }> {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const immunizations = await tx.query<ImmunizationRow>(
        `SELECT i.id, i.patient_id, p.name AS patient_name, i.encounter_id, i.vaccine_name, i.manufacturer,
                i.lot_number, i.expires_at, i.administered_at, pr.name AS professional_name, i.route, i.site,
                i.dose_number, i.next_due_at, i.status, i.reaction_notes, i.document_id
           FROM immunization.immunizations i
           JOIN registry.patients p ON p.id = i.patient_id AND p.tenant_id = i.tenant_id
           LEFT JOIN registry.professionals pr ON pr.id = i.professional_id AND pr.tenant_id = i.tenant_id
          WHERE i.tenant_id = $1
            AND ($2::uuid IS NULL OR i.patient_id = $2)
            AND ($3::uuid IS NULL OR i.encounter_id = $3)
          ORDER BY i.administered_at DESC
          LIMIT $4`,
        [ctx.tenantId, params.patientId ?? null, params.encounterId ?? null, params.limit],
      );

      const preventives = await tx.query<PreventiveRow>(
        `SELECT t.id, t.patient_id, p.name AS patient_name, t.encounter_id, t.kind, t.product_name,
                t.lot_number, t.administered_at, pr.name AS professional_name, t.dose_text,
                t.next_due_at, t.notes
           FROM immunization.preventive_treatments t
           JOIN registry.patients p ON p.id = t.patient_id AND p.tenant_id = t.tenant_id
           LEFT JOIN registry.professionals pr ON pr.id = t.professional_id AND pr.tenant_id = t.tenant_id
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
    const id = await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      await this.assertPatientOpen(tx, ctx, input.patientId, input.encounterId);

      const immunizationId = uuidv7();
      await tx.query(
        `INSERT INTO immunization.immunizations
           (id, tenant_id, patient_id, encounter_id, vaccine_name, manufacturer, lot_number, expires_at,
            administered_at, professional_id, administered_by_user_id, route, site, dose_number,
            next_due_at, status, reaction_notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8, COALESCE($9::timestamptz, now()), $10,$11,$12,$13,$14,$15,'completed',$16)`,
        [
          immunizationId,
          ctx.tenantId,
          input.patientId,
          input.encounterId ?? null,
          input.vaccineName,
          input.manufacturer ?? null,
          input.lotNumber ?? null,
          input.expiresAt ?? null,
          input.administeredAt ?? null,
          ctx.professionalId,
          ctx.user.id,
          input.route ?? null,
          input.site ?? null,
          input.doseNumber ?? null,
          input.nextDueAt ?? null,
          input.reactionNotes ?? null,
        ],
      );

      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'immunization.apply',
        entitySchema: 'immunization',
        entityTable: 'immunizations',
        entityId: immunizationId,
        after: { patientId: input.patientId, vaccineName: input.vaccineName, nextDueAt: input.nextDueAt ?? null },
      });
      await this.audit.publish(tx, ctx, {
        aggregateTable: 'immunization.immunizations',
        aggregateId: immunizationId,
        eventType: 'immunization.applied',
        payload: { patientId: input.patientId, nextDueAt: input.nextDueAt ?? null },
      });

      return immunizationId;
    });

    return this.getImmunization(ctx, id);
  }

  async getImmunization(ctx: RequestContext, id: string): Promise<Immunization> {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query<ImmunizationRow>(
        `SELECT i.id, i.patient_id, p.name AS patient_name, i.encounter_id, i.vaccine_name, i.manufacturer,
                i.lot_number, i.expires_at, i.administered_at, pr.name AS professional_name, i.route, i.site,
                i.dose_number, i.next_due_at, i.status, i.reaction_notes, i.document_id
           FROM immunization.immunizations i
           JOIN registry.patients p ON p.id = i.patient_id AND p.tenant_id = i.tenant_id
           LEFT JOIN registry.professionals pr ON pr.id = i.professional_id AND pr.tenant_id = i.tenant_id
          WHERE i.tenant_id = $1 AND i.id = $2`,
        [ctx.tenantId, id],
      );
      const row = rows[0];
      if (!row) throw AppError.notFound('Registro de vacina');
      return this.toImmunization(row);
    });
  }

  async updateImmunization(
    ctx: RequestContext,
    id: string,
    input: { nextDueAt?: string | null; reactionNotes?: string | null; lotNumber?: string | null },
  ): Promise<Immunization> {
    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query<{ status: string }>(
        `SELECT status FROM immunization.immunizations WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [id, ctx.tenantId],
      );
      if (!rows[0]) throw AppError.notFound('Registro de vacina');
      if (rows[0].status !== 'completed') {
        throw AppError.conflict('Registro cancelado não pode ser editado.');
      }

      await tx.query(
        `UPDATE immunization.immunizations
            SET next_due_at = COALESCE($3::date, next_due_at),
                reaction_notes = COALESCE($4, reaction_notes),
                lot_number = COALESCE($5, lot_number)
          WHERE id = $1 AND tenant_id = $2`,
        [id, ctx.tenantId, input.nextDueAt ?? null, input.reactionNotes ?? null, input.lotNumber ?? null],
      );

      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'immunization.update',
        entitySchema: 'immunization',
        entityTable: 'immunizations',
        entityId: id,
        after: { nextDueAt: input.nextDueAt ?? null },
      });
    });

    return this.getImmunization(ctx, id);
  }

  /** Cancelamento é marcação de erro: o registro permanece no histórico. */
  async cancelImmunization(ctx: RequestContext, id: string, reason: string): Promise<Immunization> {
    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query<{ status: string }>(
        `SELECT status FROM immunization.immunizations WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [id, ctx.tenantId],
      );
      if (!rows[0]) throw AppError.notFound('Registro de vacina');

      await tx.query(
        `UPDATE immunization.immunizations
            SET status = 'entered_in_error',
                reaction_notes = COALESCE(reaction_notes || E'\n', '') || $3
          WHERE id = $1 AND tenant_id = $2`,
        [id, ctx.tenantId, `Cancelado: ${reason}`],
      );

      await this.audit.record(tx, ctx, {
        category: 'cancel',
        action: 'immunization.cancel',
        entitySchema: 'immunization',
        entityTable: 'immunizations',
        entityId: id,
        reason,
      });
    });

    return this.getImmunization(ctx, id);
  }

  async recordPreventive(
    ctx: RequestContext,
    input: {
      patientId: string;
      encounterId?: string;
      kind: 'deworming' | 'ectoparasite' | 'other';
      productName: string;
      lotNumber?: string;
      administeredAt?: string;
      doseText?: string;
      nextDueAt?: string;
      notes?: string;
    },
  ): Promise<PreventiveTreatment> {
    const id = await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      await this.assertPatientOpen(tx, ctx, input.patientId, input.encounterId);

      const treatmentId = uuidv7();
      await tx.query(
        `INSERT INTO immunization.preventive_treatments
           (id, tenant_id, patient_id, encounter_id, kind, product_name, lot_number, administered_at,
            professional_id, administered_by_user_id, dose_text, next_due_at, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7, COALESCE($8::timestamptz, now()), $9,$10,$11,$12,$13)`,
        [
          treatmentId,
          ctx.tenantId,
          input.patientId,
          input.encounterId ?? null,
          input.kind,
          input.productName,
          input.lotNumber ?? null,
          input.administeredAt ?? null,
          ctx.professionalId,
          ctx.user.id,
          input.doseText ?? null,
          input.nextDueAt ?? null,
          input.notes ?? null,
        ],
      );

      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'preventive.record',
        entitySchema: 'immunization',
        entityTable: 'preventive_treatments',
        entityId: treatmentId,
        after: { patientId: input.patientId, kind: input.kind },
      });

      return treatmentId;
    });

    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query<PreventiveRow>(
        `SELECT t.id, t.patient_id, p.name AS patient_name, t.encounter_id, t.kind, t.product_name,
                t.lot_number, t.administered_at, pr.name AS professional_name, t.dose_text,
                t.next_due_at, t.notes
           FROM immunization.preventive_treatments t
           JOIN registry.patients p ON p.id = t.patient_id AND p.tenant_id = t.tenant_id
           LEFT JOIN registry.professionals pr ON pr.id = t.professional_id AND pr.tenant_id = t.tenant_id
          WHERE t.tenant_id = $1 AND t.id = $2`,
        [ctx.tenantId, id],
      );
      const row = rows[0];
      if (!row) throw AppError.notFound('Registro de preventivo');
      return this.toPreventive(row);
    });
  }

  /** Pendências: doses vencidas ou a vencer até a data informada. */
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
        due_at: Date;
      }>(
        `WITH horizon AS (SELECT COALESCE($2::date, CURRENT_DATE + INTERVAL '30 days')::date AS until)
         SELECT * FROM (
           SELECT 'vaccine' AS kind, i.id, i.patient_id, p.name AS patient_name,
                  g.name AS guardian_name, g.phone_primary AS guardian_phone,
                  i.vaccine_name AS product_name, i.next_due_at AS due_at
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
                  t.product_name, t.next_due_at AS due_at
             FROM immunization.preventive_treatments t
             JOIN registry.patients p ON p.id = t.patient_id AND p.tenant_id = t.tenant_id
             LEFT JOIN LATERAL (
               SELECT gu.name, gu.phone_primary FROM registry.patient_guardians pg
                 JOIN registry.guardians gu ON gu.id = pg.guardian_id AND gu.tenant_id = pg.tenant_id
                WHERE pg.patient_id = p.id AND pg.tenant_id = p.tenant_id AND pg.valid_to IS NULL
                ORDER BY pg.is_primary DESC LIMIT 1
             ) g ON true
            WHERE t.tenant_id = $1 AND t.next_due_at IS NOT NULL
              AND t.next_due_at <= (SELECT until FROM horizon)
              AND p.status = 'active' AND p.deleted_at IS NULL
              AND NOT EXISTS (
                SELECT 1 FROM immunization.preventive_treatments later
                 WHERE later.tenant_id = t.tenant_id AND later.patient_id = t.patient_id
                   AND later.product_name = t.product_name
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
          dueAt: r.due_at.toISOString().slice(0, 10),
        })),
      };
    });
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
