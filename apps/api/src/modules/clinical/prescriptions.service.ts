import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  assertEncounterWritable,
  assertPrescriptionTransition,
  computeDose,
  matchAllergies,
  normalizeIngredient,
  posologyLabel,
  type EncounterStatus,
} from '@chiron/domain';
import type { CreatePrescription, Prescription } from '@chiron/contracts';
import { DatabaseService } from '../../database/database.service';
import { AuditService } from '../../common/audit.service';
import { AppError } from '../../common/errors';
import { uuidv7 } from '../../common/uuid';
import type { RequestContext } from '../../common/request-context';
import { contextToTenantContext } from '../../common/request-context';
import { PdfService } from '../documents/pdf.service';
import { DocumentsService } from '../documents/documents.service';

@Injectable()
export class PrescriptionsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly pdf: PdfService,
    private readonly documents: DocumentsService,
  ) {}

  async list(ctx: RequestContext, params: { patientId?: string; encounterId?: string; limit: number }) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `SELECT id FROM clinical.prescriptions
          WHERE tenant_id = $1
            AND ($2::uuid IS NULL OR patient_id = $2)
            AND ($3::uuid IS NULL OR encounter_id = $3)
            AND status <> 'entered_in_error'
          ORDER BY created_at DESC LIMIT $4`,
        [ctx.tenantId, params.patientId ?? null, params.encounterId ?? null, params.limit],
      );
      const items = await Promise.all(rows.map((r) => this.loadPrescription(tx, ctx, r.id)));
      return { items };
    });
  }

  async get(ctx: RequestContext, id: string): Promise<Prescription> {
    return this.db.withTenant(contextToTenantContext(ctx), (tx) => this.loadPrescription(tx, ctx, id));
  }

  private async loadPrescription(tx: PoolClient, ctx: RequestContext, id: string): Promise<Prescription> {
    const { rows } = await tx.query<Record<string, never> & {
      id: string;
      number: string;
      patient_id: string;
      patient_name: string;
      encounter_id: string | null;
      kind: string;
      status: string;
      issued_at: Date | null;
      signed_at: Date | null;
      valid_until: Date | null;
      document_id: string | null;
      notes: string | null;
      created_at: Date;
      prescriber_id: string | null;
      prescriber_name: string | null;
      prescriber_council: string | null;
    }>(
      `SELECT p.id, p.number::text AS number, p.patient_id, pa.name AS patient_name, p.encounter_id, p.kind,
              p.status, p.issued_at, p.signed_at, p.valid_until, p.document_id, p.notes, p.created_at,
              pr.id AS prescriber_id, pr.name AS prescriber_name, pr.council_number AS prescriber_council
         FROM clinical.prescriptions p
         JOIN registry.patients pa ON pa.id = p.patient_id AND pa.tenant_id = p.tenant_id
         LEFT JOIN registry.professionals pr ON pr.id = p.professional_id AND pr.tenant_id = p.tenant_id
        WHERE p.id = $1 AND p.tenant_id = $2`,
      [id, ctx.tenantId],
    );
    const row = rows[0];
    if (!row) throw AppError.notFound('Receita');

    const items = await tx.query(
      `SELECT id, seq, product_id AS "productId", drug_name AS "drugName",
              active_ingredient AS "activeIngredient", concentration_uom AS concentration,
              dose_value::text AS "doseValue", dose_uom AS "doseUom", dose_per_kg AS "dosePerKg",
              computed_dose_value::text AS "computedDoseValue", route, frequency_kind AS "frequencyKind",
              frequency_value::text AS "frequencyValue", duration_days AS "durationDays",
              quantity::text AS quantity, quantity_uom AS "quantityUom", instructions,
              is_controlled AS "isControlled", withdrawal_meat_days AS "withdrawalMeatDays",
              withdrawal_milk_days AS "withdrawalMilkDays", extra_label AS "extraLabel"
         FROM clinical.prescription_items
        WHERE prescription_id = $1 AND tenant_id = $2
        ORDER BY seq`,
      [id, ctx.tenantId],
    );

    return {
      id: row.id,
      number: Number(row.number),
      patientId: row.patient_id,
      patientName: row.patient_name,
      encounterId: row.encounter_id,
      kind: row.kind as Prescription['kind'],
      status: row.status as Prescription['status'],
      prescriber: row.prescriber_id
        ? { id: row.prescriber_id, name: row.prescriber_name ?? '', council: row.prescriber_council }
        : null,
      issuedAt: row.issued_at?.toISOString() ?? null,
      signedAt: row.signed_at?.toISOString() ?? null,
      validUntil: row.valid_until ? row.valid_until.toISOString().slice(0, 10) : null,
      documentId: row.document_id,
      notes: row.notes,
      items: items.rows as Prescription['items'],
      createdAt: row.created_at.toISOString(),
    };
  }

  /** Alergias ativas do paciente cruzadas com os itens da receita. */
  async checkAllergies(ctx: RequestContext, patientId: string, items: CreatePrescription['items']) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const allergies = await tx.query<{ substance: string; active_ingredient_normalized: string; product_id: string | null }>(
        `SELECT substance, active_ingredient_normalized, product_id FROM registry.patient_allergies
          WHERE tenant_id = $1 AND patient_id = $2 AND status = 'active'`,
        [ctx.tenantId, patientId],
      );
      return matchAllergies(
        items.map((i) => ({
          drugName: i.drugName,
          activeIngredient: i.activeIngredient ?? null,
          productId: i.productId ?? null,
        })),
        allergies.rows.map((a) => ({
          substance: a.substance,
          normalized: a.active_ingredient_normalized,
          productId: a.product_id,
        })),
      );
    });
  }

  async create(ctx: RequestContext, input: CreatePrescription): Promise<Prescription> {
    const id = await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      if (input.encounterId) {
        const encounter = await tx.query<{ status: string; patient_id: string }>(
          `SELECT status, patient_id FROM clinical.encounters WHERE id = $1 AND tenant_id = $2`,
          [input.encounterId, ctx.tenantId],
        );
        const enc = encounter.rows[0];
        if (!enc) throw AppError.notFound('Atendimento');
        assertEncounterWritable(enc.status as EncounterStatus);
        if (enc.patient_id !== input.patientId) {
          throw AppError.validation('O atendimento pertence a outro paciente.');
        }
      }

      const patient = await tx.query<{ current_weight_kg: string | null; species_category: string }>(
        `SELECT p.current_weight_kg::text, s.category AS species_category
           FROM registry.patients p JOIN registry.species s ON s.id = p.species_id
          WHERE p.id = $1 AND p.tenant_id = $2 AND p.deleted_at IS NULL`,
        [input.patientId, ctx.tenantId],
      );
      const patientInfo = patient.rows[0];
      if (!patientInfo) throw AppError.notFound('Paciente');
      const weightKg = patientInfo.current_weight_kg ? Number(patientInfo.current_weight_kg) : null;
      const isLivestock = patientInfo.species_category === 'livestock';

      const hasControlled = input.items.some((i) => i.isControlled);
      const prescriptionId = uuidv7();
      const numberResult = await tx.query<{ next_number: string }>(
        `SELECT platform.next_number($1, 'prescription') AS next_number`,
        [ctx.tenantId],
      );

      await tx.query(
        `INSERT INTO clinical.prescriptions
           (id, tenant_id, number, patient_id, encounter_id, professional_id, kind, status, notes,
            valid_until, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',$8,$9,$10)`,
        [
          prescriptionId,
          ctx.tenantId,
          numberResult.rows[0]?.next_number ?? '1',
          input.patientId,
          input.encounterId ?? null,
          ctx.professionalId,
          hasControlled ? 'controlled' : 'simple',
          input.notes ?? null,
          input.validUntil ?? null,
          ctx.user.id,
        ],
      );

      let seq = 1;
      for (const item of input.items) {
        if (isLivestock && item.withdrawalMeatDays === undefined && item.withdrawalMilkDays === undefined) {
          // Animal de produção: carência é informação obrigatória na receita.
          throw AppError.validation(
            `Informe o período de carência (carne e leite) para "${item.drugName}" em animal de produção.`,
            { field: 'withdrawalMeatDays' },
          );
        }
        if (item.extraLabel && !item.extraLabelJustification) {
          throw AppError.validation(`Justifique o uso extra-bula de "${item.drugName}".`);
        }

        let computed: number | null = null;
        if (item.doseValue && item.doseUom) {
          const dose = computeDose({
            doseValue: item.doseValue,
            doseUom: item.doseUom,
            dosePerKg: item.dosePerKg,
            weightKg,
          });
          computed = dose.totalDose;
        }

        await tx.query(
          `INSERT INTO clinical.prescription_items
             (id, tenant_id, prescription_id, seq, product_id, drug_name, active_ingredient,
              active_ingredient_normalized, concentration_uom, dose_value, dose_uom, dose_per_kg,
              computed_dose_value, route, frequency_kind, frequency_value, duration_days, quantity,
              quantity_uom, instructions, is_controlled, is_free_text, withdrawal_meat_days,
              withdrawal_milk_days, extra_label, extra_label_justification)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)`,
          [
            uuidv7(),
            ctx.tenantId,
            prescriptionId,
            seq++,
            item.productId ?? null,
            item.drugName,
            item.activeIngredient ?? null,
            normalizeIngredient(item.activeIngredient ?? item.drugName),
            item.concentration ?? null,
            item.doseValue ?? null,
            item.doseUom ?? null,
            item.dosePerKg,
            computed,
            item.route ?? null,
            item.frequencyKind ?? null,
            item.frequencyValue ?? null,
            item.durationDays ?? null,
            item.quantity ?? null,
            item.quantityUom ?? null,
            item.instructions ?? null,
            item.isControlled,
            !item.productId,
            item.withdrawalMeatDays ?? null,
            item.withdrawalMilkDays ?? null,
            item.extraLabel,
            item.extraLabelJustification ?? null,
          ],
        );
      }

      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'prescription.create',
        entitySchema: 'clinical',
        entityTable: 'prescriptions',
        entityId: prescriptionId,
        after: { items: input.items.length, kind: hasControlled ? 'controlled' : 'simple' },
      });

      return prescriptionId;
    });

    return this.get(ctx, id);
  }

  /**
   * Assinatura: gera o PDF de forma síncrona (balcão) e trava a receita.
   * Receita com item controlado usa o modelo de controle especial (duas vias).
   */
  async sign(ctx: RequestContext, id: string): Promise<Prescription> {
    const { documentId } = await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const current = await tx.query<{ status: string; kind: string; patient_id: string; professional_id: string | null }>(
        `SELECT status, kind, patient_id, professional_id FROM clinical.prescriptions
          WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [id, ctx.tenantId],
      );
      const prescription = current.rows[0];
      if (!prescription) throw AppError.notFound('Receita');
      assertPrescriptionTransition(prescription.status as never, 'signed');

      if (prescription.kind === 'controlled' && !ctx.permissions.has('prescription:controlled')) {
        throw AppError.forbidden('Seu perfil não permite prescrever medicamentos controlados.');
      }

      const data = await this.loadPrescription(tx, ctx, id);
      const tenant = await tx.query<{ name: string; settings: Record<string, unknown> }>(
        `SELECT name, settings FROM platform.tenants WHERE id = $1`,
        [ctx.tenantId],
      );
      const patient = await tx.query<{
        name: string;
        species: string;
        breed: string | null;
        weight: string | null;
        guardian_name: string | null;
      }>(
        `SELECT p.name, s.name_pt AS species, b.name AS breed, p.current_weight_kg::text AS weight,
                (SELECT gu.name FROM registry.patient_guardians pg
                   JOIN registry.guardians gu ON gu.id = pg.guardian_id AND gu.tenant_id = pg.tenant_id
                  WHERE pg.patient_id = p.id AND pg.tenant_id = p.tenant_id AND pg.valid_to IS NULL
                  ORDER BY pg.is_primary DESC LIMIT 1) AS guardian_name
           FROM registry.patients p
           JOIN registry.species s ON s.id = p.species_id
           LEFT JOIN registry.breeds b ON b.id = p.breed_id
          WHERE p.id = $1 AND p.tenant_id = $2`,
        [prescription.patient_id, ctx.tenantId],
      );

      const pdfBuffer = await this.pdf.prescription({
        tenantName: tenant.rows[0]?.name ?? 'Clínica',
        header: (tenant.rows[0]?.settings?.['prescriptionHeader'] as string) ?? null,
        controlled: prescription.kind === 'controlled',
        number: data.number,
        issuedAt: new Date(),
        patient: {
          name: patient.rows[0]?.name ?? '',
          species: patient.rows[0]?.species ?? '',
          breed: patient.rows[0]?.breed ?? null,
          weight: patient.rows[0]?.weight ?? null,
          guardianName: patient.rows[0]?.guardian_name ?? null,
        },
        prescriber: {
          name: data.prescriber?.name ?? ctx.user.name,
          council: data.prescriber?.council ?? null,
        },
        items: data.items.map((item) => ({
          drugName: item.drugName,
          concentration: item.concentration,
          posology: posologyLabel({
            dose:
              item.computedDoseValue && item.doseUom
                ? {
                    totalDose: Number(item.computedDoseValue),
                    totalDoseUom: item.doseUom,
                    administerValue: null,
                    administerUom: null,
                    label: `${item.computedDoseValue} ${item.doseUom}`,
                  }
                : null,
            route: item.route,
            frequencyKind: item.frequencyKind,
            frequencyValue: item.frequencyValue ? Number(item.frequencyValue) : null,
            durationDays: item.durationDays,
            instructions: item.instructions,
          }),
          quantity: item.quantity ? `${item.quantity} ${item.quantityUom ?? ''}`.trim() : null,
          withdrawal:
            item.withdrawalMeatDays || item.withdrawalMilkDays
              ? `Carência: carne ${item.withdrawalMeatDays ?? 0} dia(s), leite ${item.withdrawalMilkDays ?? 0} dia(s)`
              : null,
        })),
        notes: data.notes,
      });

      const document = await this.documents.storeGeneratedInTx(tx, ctx, {
        kind: 'prescription',
        title: `Receita ${data.number} - ${patient.rows[0]?.name ?? ''}`.trim(),
        buffer: pdfBuffer,
        mimeType: 'application/pdf',
        generatedFromTable: 'clinical.prescriptions',
        generatedFromId: id,
        templateKey: prescription.kind === 'controlled' ? 'prescription_controlled' : 'prescription_simple',
        links: [
          { targetType: 'prescription', targetId: id },
          { targetType: 'patient', targetId: prescription.patient_id },
        ],
      });

      await tx.query(
        `UPDATE clinical.prescriptions
            SET status = 'signed', signed_at = now(), signed_by = $3, issued_at = now(),
                row_version = row_version + 1
          WHERE id = $1 AND tenant_id = $2`,
        [id, ctx.tenantId, ctx.user.id],
      );
      await tx.query(`UPDATE clinical.prescriptions SET document_id = $3 WHERE id = $1 AND tenant_id = $2`, [
        id,
        ctx.tenantId,
        document.id,
      ]);

      await this.audit.record(tx, ctx, {
        category: 'sign',
        action: 'prescription.sign',
        entitySchema: 'clinical',
        entityTable: 'prescriptions',
        entityId: id,
        after: { documentId: document.id, kind: prescription.kind },
      });
      await this.audit.publish(tx, ctx, {
        aggregateTable: 'clinical.prescriptions',
        aggregateId: id,
        eventType: 'prescription.signed',
        payload: { patientId: prescription.patient_id },
      });

      return { documentId: document.id };
    });

    void documentId;
    return this.get(ctx, id);
  }

  async cancel(ctx: RequestContext, id: string, reason: string): Promise<Prescription> {
    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const current = await tx.query<{ status: string }>(
        `SELECT status FROM clinical.prescriptions WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [id, ctx.tenantId],
      );
      const row = current.rows[0];
      if (!row) throw AppError.notFound('Receita');
      assertPrescriptionTransition(row.status as never, 'cancelled');

      await tx.query(
        `UPDATE clinical.prescriptions SET status = 'cancelled', status_reason = $3, row_version = row_version + 1
          WHERE id = $1 AND tenant_id = $2`,
        [id, ctx.tenantId, reason],
      );

      await this.audit.record(tx, ctx, {
        category: 'cancel',
        action: 'prescription.cancel',
        entitySchema: 'clinical',
        entityTable: 'prescriptions',
        entityId: id,
        reason,
      });
    });
    return this.get(ctx, id);
  }
}
