import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { MedicalRecord, TimelineItem } from '@chiron/contracts';
import { DatabaseService } from '../../database/database.service';
import { AuditService } from '../../common/audit.service';
import { AppError } from '../../common/errors';
import type { RequestContext } from '../../common/request-context';
import { contextToTenantContext } from '../../common/request-context';

/**
 * A linha do tempo é derivada das fontes de verdade (UNION ALL), nunca uma
 * segunda tabela escrita pela aplicação. Itens sensíveis são redigidos para
 * quem não tem `record:read_sensitive`.
 */
const TIMELINE_SQL = `
  SELECT * FROM (
    SELECT p.id::text AS id, 'patient.created' AS kind, p.created_at AS occurred_at,
           'Paciente cadastrado' AS title, p.name AS summary, 'basic' AS sensitivity,
           NULL::uuid AS encounter_id, 'registry.patients' AS source_table, p.id AS source_id,
           NULL::text AS actor_name
      FROM registry.patients p
     WHERE p.tenant_id = $1 AND p.id = $2

    UNION ALL
    SELECT d.id::text, 'patient.deceased', d.occurred_at,
           CASE WHEN d.kind = 'euthanasia' THEN 'Óbito (eutanásia)' ELSE 'Óbito' END,
           d.cause_text, 'basic', d.encounter_id, 'clinical.patient_deaths', d.id, NULL
      FROM clinical.patient_deaths d
     WHERE d.tenant_id = $1 AND d.patient_id = $2

    UNION ALL
    SELECT a.id::text, 'allergy.added', a.noted_at, 'Alergia registrada', a.substance, 'basic',
           a.source_encounter_id, 'registry.patient_allergies', a.id, NULL
      FROM registry.patient_allergies a
     WHERE a.tenant_id = $1 AND a.patient_id = $2 AND a.status = 'active'

    UNION ALL
    SELECT o.id::text, 'weight.recorded', o.measured_at, 'Peso registrado',
           o.value_numeric::text || ' kg', 'basic', o.encounter_id, 'clinical.observations', o.id,
           pr.name
      FROM clinical.observations o
      LEFT JOIN registry.professionals pr ON pr.id = o.measured_by_professional_id AND pr.tenant_id = o.tenant_id
     WHERE o.tenant_id = $1 AND o.patient_id = $2 AND o.code = 'weight' AND o.status = 'final'

    UNION ALL
    SELECT e.id::text, 'encounter.started', COALESCE(e.started_at, e.arrived_at, e.created_at),
           'Atendimento iniciado', COALESCE(sc.name, e.class), 'basic', e.id, 'clinical.encounters', e.id,
           pr.name
      FROM clinical.encounters e
      LEFT JOIN registry.service_catalog sc ON sc.id = e.service_id AND sc.tenant_id = e.tenant_id
      LEFT JOIN registry.professionals pr ON pr.id = e.attending_professional_id AND pr.tenant_id = e.tenant_id
     WHERE e.tenant_id = $1 AND e.patient_id = $2 AND e.status <> 'cancelled'

    UNION ALL
    SELECT (e.id::text || ':finished'), 'encounter.finished', e.finished_at,
           'Atendimento finalizado', e.primary_diagnosis_summary, 'sensitive', e.id,
           'clinical.encounters', e.id, pr.name
      FROM clinical.encounters e
      LEFT JOIN registry.professionals pr ON pr.id = e.attending_professional_id AND pr.tenant_id = e.tenant_id
     WHERE e.tenant_id = $1 AND e.patient_id = $2 AND e.status = 'finished' AND e.finished_at IS NOT NULL

    UNION ALL
    SELECT d.id::text, 'diagnosis.final', d.recorded_at, 'Diagnóstico', d.description, 'sensitive',
           d.encounter_id, 'clinical.encounter_diagnoses', d.id, pr.name
      FROM clinical.encounter_diagnoses d
      LEFT JOIN registry.professionals pr ON pr.id = d.recorded_by_professional_id AND pr.tenant_id = d.tenant_id
     WHERE d.tenant_id = $1 AND d.patient_id = $2 AND d.kind IN ('final', 'presumptive')

    UNION ALL
    SELECT pr2.id::text, 'prescription.signed', pr2.signed_at, 'Receita emitida',
           (SELECT string_agg(pi.drug_name, ', ') FROM clinical.prescription_items pi
             WHERE pi.prescription_id = pr2.id AND pi.tenant_id = pr2.tenant_id),
           'sensitive', pr2.encounter_id, 'clinical.prescriptions', pr2.id, prof.name
      FROM clinical.prescriptions pr2
      LEFT JOIN registry.professionals prof ON prof.id = pr2.professional_id AND prof.tenant_id = pr2.tenant_id
     WHERE pr2.tenant_id = $1 AND pr2.patient_id = $2 AND pr2.status = 'signed'

    UNION ALL
    SELECT eo.id::text, 'exam.ordered', eo.ordered_at, 'Exames solicitados',
           (SELECT string_agg(ec.name, ', ') FROM lab.exam_order_items eoi
              JOIN lab.exam_catalog ec ON ec.id = eoi.exam_catalog_id
             WHERE eoi.exam_order_id = eo.id AND eoi.tenant_id = eo.tenant_id),
           'sensitive', eo.encounter_id, 'lab.exam_orders', eo.id, prof.name
      FROM lab.exam_orders eo
      LEFT JOIN registry.professionals prof ON prof.id = eo.ordered_by_professional_id AND prof.tenant_id = eo.tenant_id
     WHERE eo.tenant_id = $1 AND eo.patient_id = $2 AND eo.status <> 'cancelled'

    UNION ALL
    SELECT er.id::text, 'exam.resulted', er.released_at, 'Resultado de exame',
           left(COALESCE(er.report_text, er.interpretation, ''), 200), 'sensitive',
           eo.encounter_id, 'lab.exam_results', er.id, NULL
      FROM lab.exam_results er
      JOIN lab.exam_order_items eoi ON eoi.id = er.exam_order_item_id AND eoi.tenant_id = er.tenant_id
      JOIN lab.exam_orders eo ON eo.id = eoi.exam_order_id AND eo.tenant_id = eoi.tenant_id
     WHERE er.tenant_id = $1 AND er.patient_id = $2 AND er.status <> 'entered_in_error'

    UNION ALL
    SELECT i.id::text, 'immunization.applied', i.administered_at, 'Vacina aplicada', i.vaccine_name,
           'basic', i.encounter_id, 'immunization.immunizations', i.id, prof.name
      FROM immunization.immunizations i
      LEFT JOIN registry.professionals prof ON prof.id = i.professional_id AND prof.tenant_id = i.tenant_id
     WHERE i.tenant_id = $1 AND i.patient_id = $2 AND i.status = 'completed'

    UNION ALL
    SELECT pt.id::text, 'preventive.applied', pt.administered_at,
           CASE pt.kind WHEN 'deworming' THEN 'Vermífugo aplicado'
                        WHEN 'ectoparasite' THEN 'Antiparasitário aplicado'
                        ELSE 'Preventivo aplicado' END,
           pt.product_name, 'basic', pt.encounter_id, 'immunization.preventive_treatments', pt.id, prof.name
      FROM immunization.preventive_treatments pt
      LEFT JOIN registry.professionals prof ON prof.id = pt.professional_id AND prof.tenant_id = pt.tenant_id
     WHERE pt.tenant_id = $1 AND pt.patient_id = $2

    UNION ALL
    SELECT doc.id::text, 'document.attached', doc.created_at, 'Documento', doc.title, 'basic',
           (SELECT dl2.target_id FROM documents.document_links dl2
             WHERE dl2.document_id = doc.id AND dl2.tenant_id = doc.tenant_id
               AND dl2.target_type = 'encounter' LIMIT 1),
           'documents.documents', doc.id, NULL
      FROM documents.documents doc
      JOIN documents.document_links dl ON dl.document_id = doc.id AND dl.tenant_id = doc.tenant_id
     WHERE doc.tenant_id = $1 AND dl.target_type = 'patient' AND dl.target_id = $2
       AND doc.status = 'active'

    UNION ALL
    SELECT ap.id::text, 'appointment.scheduled', ap.created_at, 'Agendamento', sc.name, 'basic',
           ap.encounter_id, 'scheduling.appointments', ap.id, prof.name
      FROM scheduling.appointments ap
      JOIN registry.service_catalog sc ON sc.id = ap.service_id AND sc.tenant_id = ap.tenant_id
      LEFT JOIN registry.professionals prof ON prof.id = ap.professional_id AND prof.tenant_id = ap.tenant_id
     WHERE ap.tenant_id = $1 AND ap.patient_id = $2

    UNION ALL
    SELECT (ap.id::text || ':no_show'), 'appointment.no_show', ap.cancelled_at, 'Falta registrada', sc.name,
           'basic', NULL, 'scheduling.appointments', ap.id, NULL
      FROM scheduling.appointments ap
      JOIN registry.service_catalog sc ON sc.id = ap.service_id AND sc.tenant_id = ap.tenant_id
     WHERE ap.tenant_id = $1 AND ap.patient_id = $2 AND ap.status = 'no_show' AND ap.cancelled_at IS NOT NULL
  ) t
  WHERE t.occurred_at IS NOT NULL
    AND ($3::timestamptz IS NULL OR t.occurred_at < $3)
  ORDER BY t.occurred_at DESC
  LIMIT $4
`;

@Injectable()
export class TimelineService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async forPatient(
    ctx: RequestContext,
    patientId: string,
    params: { limit: number; cursor?: string; kinds?: string },
  ): Promise<{ items: TimelineItem[]; nextCursor: string | null }> {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      await this.assertPatient(tx, ctx, patientId);

      const { rows } = await tx.query<{
        id: string;
        kind: string;
        occurred_at: Date;
        title: string;
        summary: string | null;
        sensitivity: string;
        encounter_id: string | null;
        source_table: string;
        source_id: string;
        actor_name: string | null;
      }>(TIMELINE_SQL, [ctx.tenantId, patientId, params.cursor ?? null, params.limit + 1]);

      const canReadSensitive = ctx.permissions.has('record:read_sensitive');
      const filterKinds = params.kinds?.split(',').filter(Boolean);

      const hasMore = rows.length > params.limit;
      const page = hasMore ? rows.slice(0, params.limit) : rows;

      const items: TimelineItem[] = page
        .filter((r) => !filterKinds || filterKinds.includes(r.kind))
        .map((r) => {
          const sensitive = r.sensitivity === 'sensitive';
          return {
            id: r.id,
            kind: r.kind as TimelineItem['kind'],
            occurredAt: r.occurred_at.toISOString(),
            title: r.title,
            // conteúdo clínico é redigido para quem não tem permissão
            summary: sensitive && !canReadSensitive ? null : r.summary,
            sensitivity: r.sensitivity as TimelineItem['sensitivity'],
            encounterId: r.encounter_id,
            sourceTable: r.source_table,
            sourceId: r.source_id,
            actorName: r.actor_name,
          };
        });

      await this.audit.recordAccess(tx, ctx, { resource: 'timeline', patientId, resourceId: patientId });

      const last = hasMore ? page[page.length - 1] : undefined;
      return { items, nextCursor: last ? last.occurred_at.toISOString() : null };
    });
  }

  /** Prontuário: atendimentos com suas seções, agrupados cronologicamente. */
  async medicalRecord(ctx: RequestContext, patientId: string): Promise<MedicalRecord> {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      await this.assertPatient(tx, ctx, patientId);

      const encounters = await tx.query<{
        id: string;
        number: string;
        facility_id: string;
        class: string;
        status: string;
        service_name: string | null;
        professional_id: string | null;
        professional_name: string | null;
        appointment_id: string | null;
        arrived_at: Date | null;
        started_at: Date | null;
        ended_at: Date | null;
        chief_complaint: string | null;
        primary_diagnosis_summary: string | null;
        disposition: string | null;
        created_at: Date;
        patient_name: string;
        species_name: string;
        breed_name: string | null;
        weight: string | null;
        guardian_name: string | null;
      }>(
        `SELECT e.id, e.number::text AS number, e.facility_id, e.class, e.status,
                sc.name AS service_name, pr.id AS professional_id, pr.name AS professional_name,
                e.appointment_id, e.arrived_at, e.started_at, e.ended_at, e.chief_complaint,
                e.primary_diagnosis_summary, e.disposition, e.created_at,
                p.name AS patient_name, s.name_pt AS species_name, b.name AS breed_name,
                e.weight_kg::text AS weight,
                (SELECT gu.name FROM registry.patient_guardians pg
                   JOIN registry.guardians gu ON gu.id = pg.guardian_id AND gu.tenant_id = pg.tenant_id
                  WHERE pg.patient_id = p.id AND pg.tenant_id = p.tenant_id AND pg.valid_to IS NULL
                  ORDER BY pg.is_primary DESC LIMIT 1) AS guardian_name
           FROM clinical.encounters e
           JOIN registry.patients p ON p.id = e.patient_id AND p.tenant_id = e.tenant_id
           JOIN registry.species s ON s.id = p.species_id
           LEFT JOIN registry.breeds b ON b.id = p.breed_id
           LEFT JOIN registry.service_catalog sc ON sc.id = e.service_id AND sc.tenant_id = e.tenant_id
           LEFT JOIN registry.professionals pr ON pr.id = e.attending_professional_id AND pr.tenant_id = e.tenant_id
          WHERE e.tenant_id = $1 AND e.patient_id = $2 AND e.status <> 'entered_in_error'
          ORDER BY COALESCE(e.started_at, e.arrived_at, e.created_at) DESC
          LIMIT 200`,
        [ctx.tenantId, patientId],
      );

      const ids = encounters.rows.map((e) => e.id);
      if (ids.length === 0) {
        await this.audit.recordAccess(tx, ctx, { resource: 'record', patientId, resourceId: patientId });
        return { patientId, encounters: [], redacted: false };
      }

      const [notes, diagnoses, observations, prescriptions, examOrders] = await Promise.all([
        tx.query(
          `SELECT n.id, n.encounter_id AS "encounterId", n.kind, n.title, n.body, n.structured, n.status,
                  n.signed_at AS "signedAt", n.supersedes_note_id AS "supersedesNoteId",
                  n.superseded_by_note_id AS "supersededByNoteId", n.version, n.occurred_at AS "occurredAt",
                  n.created_at AS "createdAt", pr.id AS "authorId", pr.name AS "authorName"
             FROM clinical.encounter_notes n
             LEFT JOIN registry.professionals pr ON pr.id = n.author_professional_id AND pr.tenant_id = n.tenant_id
            WHERE n.tenant_id = $1 AND n.encounter_id = ANY($2) AND n.status <> 'entered_in_error'
            ORDER BY n.sequence`,
          [ctx.tenantId, ids],
        ),
        tx.query(
          `SELECT d.id, d.encounter_id AS "encounterId", d.description, d.condition_id AS "conditionId",
                  d.kind, d.rank, d.notes, d.recorded_at AS "recordedAt", pr.name AS "recordedByName"
             FROM clinical.encounter_diagnoses d
             LEFT JOIN registry.professionals pr ON pr.id = d.recorded_by_professional_id AND pr.tenant_id = d.tenant_id
            WHERE d.tenant_id = $1 AND d.encounter_id = ANY($2)
            ORDER BY d.rank`,
          [ctx.tenantId, ids],
        ),
        tx.query(
          `SELECT o.id, o.encounter_id AS "encounterId", o.code, oc.name AS "codeName",
                  o.value_numeric::text AS "valueNumeric", o.value_text AS "valueText",
                  o.value_code AS "valueCode", o.uom, o.entered_value AS "enteredValue",
                  o.entered_uom AS "enteredUom", o.measured_at AS "measuredAt",
                  o.abnormal_flag AS "abnormalFlag", o.abnormal_flag_status AS "abnormalFlagStatus",
                  o.reference_min::text AS "referenceMin", o.reference_max::text AS "referenceMax",
                  o.notes, pr.name AS "measuredByName"
             FROM clinical.observations o
             JOIN clinical.observation_codes oc ON oc.code = o.code
             LEFT JOIN registry.professionals pr ON pr.id = o.measured_by_professional_id AND pr.tenant_id = o.tenant_id
            WHERE o.tenant_id = $1 AND o.encounter_id = ANY($2) AND o.status = 'final'
            ORDER BY o.measured_at`,
          [ctx.tenantId, ids],
        ),
        tx.query(
          `SELECT p.id, p.number::text AS number, p.patient_id AS "patientId", p.encounter_id AS "encounterId",
                  p.kind, p.status, p.issued_at AS "issuedAt", p.signed_at AS "signedAt",
                  p.valid_until AS "validUntil", p.document_id AS "documentId", p.notes, p.created_at AS "createdAt",
                  pr.id AS "prescriberId", pr.name AS "prescriberName", pr.council_number AS "prescriberCouncil",
                  COALESCE((SELECT json_agg(json_build_object(
                      'id', pi.id, 'seq', pi.seq, 'productId', pi.product_id, 'drugName', pi.drug_name,
                      'activeIngredient', pi.active_ingredient, 'concentration', pi.concentration_uom,
                      'doseValue', pi.dose_value::text, 'doseUom', pi.dose_uom, 'dosePerKg', pi.dose_per_kg,
                      'computedDoseValue', pi.computed_dose_value::text, 'route', pi.route,
                      'frequencyKind', pi.frequency_kind, 'frequencyValue', pi.frequency_value::text,
                      'durationDays', pi.duration_days, 'quantity', pi.quantity::text,
                      'quantityUom', pi.quantity_uom, 'instructions', pi.instructions,
                      'isControlled', pi.is_controlled, 'withdrawalMeatDays', pi.withdrawal_meat_days,
                      'withdrawalMilkDays', pi.withdrawal_milk_days, 'extraLabel', pi.extra_label
                    ) ORDER BY pi.seq)
                    FROM clinical.prescription_items pi
                   WHERE pi.prescription_id = p.id AND pi.tenant_id = p.tenant_id), '[]'::json) AS items
             FROM clinical.prescriptions p
             LEFT JOIN registry.professionals pr ON pr.id = p.professional_id AND pr.tenant_id = p.tenant_id
            WHERE p.tenant_id = $1 AND p.encounter_id = ANY($2) AND p.status <> 'entered_in_error'
            ORDER BY p.created_at`,
          [ctx.tenantId, ids],
        ),
        tx.query<{ id: string; encounter_id: string }>(
          `SELECT id, encounter_id FROM lab.exam_orders
            WHERE tenant_id = $1 AND encounter_id = ANY($2) AND status <> 'cancelled'`,
          [ctx.tenantId, ids],
        ),
      ]);

      const byEncounter = <T extends { encounterId?: string; encounter_id?: string }>(rows: T[], id: string) =>
        rows.filter((r) => (r.encounterId ?? r.encounter_id) === id);

      const record: MedicalRecord = {
        patientId,
        redacted: false,
        encounters: encounters.rows.map((e) => ({
          encounter: {
            id: e.id,
            number: Number(e.number),
            facilityId: e.facility_id,
            patient: {
              id: patientId,
              name: e.patient_name,
              speciesName: e.species_name,
              breedName: e.breed_name,
              ageLabel: null,
              currentWeightKg: e.weight,
            },
            guardianName: e.guardian_name,
            class: e.class as never,
            status: e.status as never,
            serviceName: e.service_name,
            attendingProfessional: e.professional_id
              ? { id: e.professional_id, name: e.professional_name ?? '' }
              : null,
            appointmentId: e.appointment_id,
            arrivedAt: e.arrived_at?.toISOString() ?? null,
            startedAt: e.started_at?.toISOString() ?? null,
            endedAt: e.ended_at?.toISOString() ?? null,
            chiefComplaint: e.chief_complaint,
            primaryDiagnosisSummary: e.primary_diagnosis_summary,
            disposition: e.disposition as never,
            createdAt: e.created_at.toISOString(),
          },
          notes: byEncounter(notes.rows as never[], e.id).map((n: Record<string, unknown>) => ({
            ...n,
            author: n.authorId ? { id: n.authorId, name: n.authorName } : null,
            signedAt: n.signedAt ? (n.signedAt as Date).toISOString() : null,
            occurredAt: (n.occurredAt as Date).toISOString(),
            createdAt: (n.createdAt as Date).toISOString(),
          })) as MedicalRecord['encounters'][number]['notes'],
          diagnoses: byEncounter(diagnoses.rows as never[], e.id).map((d: Record<string, unknown>) => ({
            ...d,
            recordedAt: (d.recordedAt as Date).toISOString(),
          })) as MedicalRecord['encounters'][number]['diagnoses'],
          observations: byEncounter(observations.rows as never[], e.id).map((o: Record<string, unknown>) => ({
            ...o,
            measuredAt: (o.measuredAt as Date).toISOString(),
          })) as MedicalRecord['encounters'][number]['observations'],
          prescriptions: byEncounter(prescriptions.rows as never[], e.id).map((p: Record<string, unknown>) => ({
            ...p,
            patientName: e.patient_name,
            prescriber: p.prescriberId
              ? { id: p.prescriberId, name: p.prescriberName, council: p.prescriberCouncil }
              : null,
            issuedAt: p.issuedAt ? (p.issuedAt as Date).toISOString() : null,
            signedAt: p.signedAt ? (p.signedAt as Date).toISOString() : null,
            validUntil: p.validUntil ? (p.validUntil as Date).toISOString().slice(0, 10) : null,
            createdAt: (p.createdAt as Date).toISOString(),
            number: Number(p.number),
          })) as MedicalRecord['encounters'][number]['prescriptions'],
          examOrderIds: examOrders.rows.filter((x) => x.encounter_id === e.id).map((x) => x.id),
        })),
      };

      await this.audit.recordAccess(tx, ctx, { resource: 'record', patientId, resourceId: patientId });
      return record;
    });
  }

  private async assertPatient(tx: PoolClient, ctx: RequestContext, patientId: string): Promise<void> {
    const { rowCount } = await tx.query(
      `SELECT 1 FROM registry.patients WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [patientId, ctx.tenantId],
    );
    if (!rowCount) throw AppError.notFound('Paciente');
  }
}
