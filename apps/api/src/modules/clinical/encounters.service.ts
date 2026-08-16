import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import {
  assertEncounterTransition,
  assertEncounterWritable,
  assertMinimumContent,
  ageLabel,
  classifyObservation,
  lifeStageFor,
  normalizeObservation,
  type EncounterContentSnapshot,
  type EncounterStatus,
  type ServiceCategory,
} from '@chiron/domain';
import type {
  CreateEncounter,
  EncounterDetail,
  EncounterSummary,
  FinishEncounter,
  RecordObservations,
  UpsertNote,
} from '@chiron/contracts';
import { DatabaseService } from '../../database/database.service';
import { AuditService } from '../../common/audit.service';
import { AppError } from '../../common/errors';
import { uuidv7 } from '../../common/uuid';
import type { RequestContext } from '../../common/request-context';
import { contextToTenantContext, facilityScope } from '../../common/request-context';

const ENCOUNTER_SELECT = `
  e.id, e.number::text AS number, e.facility_id, e.class, e.status, e.appointment_id,
  e.arrived_at, e.started_at, e.ended_at, e.chief_complaint, e.primary_diagnosis_summary,
  e.disposition, e.weight_kg::text AS weight_kg, e.follow_up_due_at, e.follow_up_reason,
  e.follow_up_appointment_id, e.referral, e.integrity_hash, e.reopened_at, e.reopen_reason,
  e.row_version, e.created_at,
  p.id AS patient_id, p.name AS patient_name, p.birth_date AS patient_birth_date,
  p.estimated_age_months AS patient_age_months, p.current_weight_kg::text AS patient_weight,
  s.name_pt AS species_name, s.code AS species_code, s.category AS species_category, b.name AS breed_name,
  pr.id AS professional_id, pr.name AS professional_name,
  fin.name AS finished_by_name,
  sc.name AS service_name, sc.category AS service_category,
  g.name AS guardian_name
`;

const ENCOUNTER_FROM = `
  FROM clinical.encounters e
  JOIN registry.patients p ON p.id = e.patient_id AND p.tenant_id = e.tenant_id
  JOIN registry.species s ON s.id = p.species_id
  LEFT JOIN registry.breeds b ON b.id = p.breed_id
  LEFT JOIN registry.professionals pr ON pr.id = e.attending_professional_id AND pr.tenant_id = e.tenant_id
  LEFT JOIN registry.professionals fin ON fin.user_id = e.finished_by AND fin.tenant_id = e.tenant_id
  LEFT JOIN registry.service_catalog sc ON sc.id = e.service_id AND sc.tenant_id = e.tenant_id
  LEFT JOIN LATERAL (
    SELECT gu.name FROM registry.patient_guardians pg
      JOIN registry.guardians gu ON gu.id = pg.guardian_id AND gu.tenant_id = pg.tenant_id
     WHERE pg.patient_id = p.id AND pg.tenant_id = p.tenant_id AND pg.valid_to IS NULL
     ORDER BY pg.is_primary DESC LIMIT 1
  ) g ON true
`;

interface EncounterRow {
  id: string;
  number: string;
  facility_id: string;
  class: string;
  status: string;
  appointment_id: string | null;
  arrived_at: Date | null;
  started_at: Date | null;
  ended_at: Date | null;
  chief_complaint: string | null;
  primary_diagnosis_summary: string | null;
  disposition: string | null;
  weight_kg: string | null;
  follow_up_due_at: Date | null;
  follow_up_reason: string | null;
  follow_up_appointment_id: string | null;
  referral: { to: string; reason: string; notes: string | null } | null;
  integrity_hash: string | null;
  reopened_at: Date | null;
  reopen_reason: string | null;
  row_version: number;
  created_at: Date;
  patient_id: string;
  patient_name: string;
  patient_birth_date: Date | null;
  patient_age_months: number | null;
  patient_weight: string | null;
  species_name: string;
  species_code: string;
  species_category: string;
  breed_name: string | null;
  professional_id: string | null;
  professional_name: string | null;
  finished_by_name: string | null;
  service_name: string | null;
  service_category: string | null;
  guardian_name: string | null;
}

@Injectable()
export class EncountersService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  private toSummary(row: EncounterRow): EncounterSummary {
    return {
      id: row.id,
      number: Number(row.number),
      facilityId: row.facility_id,
      patient: {
        id: row.patient_id,
        name: row.patient_name,
        speciesName: row.species_name,
        breedName: row.breed_name,
        ageLabel: ageLabel(row.patient_birth_date, row.patient_age_months),
        currentWeightKg: row.patient_weight,
      },
      guardianName: row.guardian_name,
      class: row.class as EncounterSummary['class'],
      status: row.status as EncounterSummary['status'],
      serviceName: row.service_name,
      attendingProfessional: row.professional_id
        ? { id: row.professional_id, name: row.professional_name ?? '' }
        : null,
      appointmentId: row.appointment_id,
      arrivedAt: row.arrived_at?.toISOString() ?? null,
      startedAt: row.started_at?.toISOString() ?? null,
      endedAt: row.ended_at?.toISOString() ?? null,
      chiefComplaint: row.chief_complaint,
      primaryDiagnosisSummary: row.primary_diagnosis_summary,
      disposition: row.disposition as EncounterSummary['disposition'],
      createdAt: row.created_at.toISOString(),
    };
  }

  async list(ctx: RequestContext, params: Record<string, unknown> & { limit: number }) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const scope = facilityScope(ctx);
      const { rows } = await tx.query<EncounterRow>(
        `SELECT ${ENCOUNTER_SELECT} ${ENCOUNTER_FROM}
          WHERE e.tenant_id = $1
            AND ($2::text IS NULL OR e.status = $2)
            AND ($3::uuid IS NULL OR e.facility_id = $3)
            AND ($4::uuid IS NULL OR e.patient_id = $4)
            AND ($5::uuid IS NULL OR e.attending_professional_id = $5)
            AND ($6::timestamptz IS NULL OR e.created_at >= $6)
            AND ($7::timestamptz IS NULL OR e.created_at < $7)
            AND ($8::boolean IS NOT TRUE OR e.status IN ('arrived','triaged','in_progress','on_hold'))
            AND ($9::text IS NULL OR p.name ILIKE '%' || $9 || '%')
            AND ($10::uuid[] IS NULL OR e.facility_id = ANY($10))
          ORDER BY e.created_at DESC
          LIMIT $11`,
        [
          ctx.tenantId,
          params.status ?? null,
          params.facilityId ?? null,
          params.patientId ?? null,
          params.professionalId ?? null,
          params.from ?? null,
          params.to ?? null,
          params.open ?? null,
          params.q ?? null,
          scope,
          params.limit,
        ],
      );
      return { items: rows.map((r) => this.toSummary(r)), nextCursor: null };
    });
  }

  async get(ctx: RequestContext, id: string): Promise<EncounterDetail> {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const detail = await this.loadDetail(tx, ctx, id);
      await this.audit.recordAccess(tx, ctx, {
        resource: 'encounter',
        resourceId: id,
        patientId: detail.patient.id,
      });
      return detail;
    });
  }

  private async loadDetail(tx: PoolClient, ctx: RequestContext, id: string): Promise<EncounterDetail> {
    const { rows } = await tx.query<EncounterRow>(
      `SELECT ${ENCOUNTER_SELECT} ${ENCOUNTER_FROM} WHERE e.tenant_id = $1 AND e.id = $2`,
      [ctx.tenantId, id],
    );
    const row = rows[0];
    if (!row) throw AppError.notFound('Atendimento');

    const canReadSensitive = ctx.permissions.has('record:read_sensitive');

    const [notes, observations, diagnoses, procedures] = await Promise.all([
      canReadSensitive
        ? tx.query(
            `SELECT n.id, n.encounter_id AS "encounterId", n.kind, n.title, n.body, n.structured, n.status,
                    n.signed_at AS "signedAt", n.supersedes_note_id AS "supersedesNoteId",
                    n.superseded_by_note_id AS "supersededByNoteId", n.version,
                    n.occurred_at AS "occurredAt", n.created_at AS "createdAt",
                    pr.id AS "authorId", pr.name AS "authorName"
               FROM clinical.encounter_notes n
               LEFT JOIN registry.professionals pr ON pr.id = n.author_professional_id AND pr.tenant_id = n.tenant_id
              WHERE n.tenant_id = $1 AND n.encounter_id = $2 AND n.status <> 'entered_in_error'
              ORDER BY n.sequence, n.created_at`,
            [ctx.tenantId, id],
          )
        : Promise.resolve({ rows: [] as never[] }),
      tx.query(
        `SELECT o.id, o.code, oc.name AS "codeName", o.value_numeric::text AS "valueNumeric",
                o.value_text AS "valueText", o.value_code AS "valueCode", o.uom,
                o.entered_value AS "enteredValue", o.entered_uom AS "enteredUom",
                o.measured_at AS "measuredAt", o.abnormal_flag AS "abnormalFlag",
                o.abnormal_flag_status AS "abnormalFlagStatus",
                o.reference_min::text AS "referenceMin", o.reference_max::text AS "referenceMax",
                o.encounter_id AS "encounterId", o.notes,
                pr.name AS "measuredByName"
           FROM clinical.observations o
           JOIN clinical.observation_codes oc ON oc.code = o.code
           LEFT JOIN registry.professionals pr ON pr.id = o.measured_by_professional_id AND pr.tenant_id = o.tenant_id
          WHERE o.tenant_id = $1 AND o.encounter_id = $2 AND o.status = 'final'
          ORDER BY o.measured_at, oc.sort`,
        [ctx.tenantId, id],
      ),
      canReadSensitive
        ? tx.query(
            `SELECT d.id, d.description, d.condition_id AS "conditionId", d.kind, d.rank, d.notes,
                    d.recorded_at AS "recordedAt", pr.name AS "recordedByName"
               FROM clinical.encounter_diagnoses d
               LEFT JOIN registry.professionals pr ON pr.id = d.recorded_by_professional_id AND pr.tenant_id = d.tenant_id
              WHERE d.tenant_id = $1 AND d.encounter_id = $2
              ORDER BY d.rank, d.recorded_at`,
            [ctx.tenantId, id],
          )
        : Promise.resolve({ rows: [] as never[] }),
      tx.query(
        `SELECT ep.id, ep.description, ep.service_id AS "serviceId", sc.name AS "serviceName",
                ep.performed_at AS "performedAt", pr.name AS "performedByName", ep.notes
           FROM clinical.encounter_procedures ep
           LEFT JOIN registry.service_catalog sc ON sc.id = ep.service_id AND sc.tenant_id = ep.tenant_id
           LEFT JOIN registry.professionals pr ON pr.id = ep.performed_by_professional_id AND pr.tenant_id = ep.tenant_id
          WHERE ep.tenant_id = $1 AND ep.encounter_id = $2
          ORDER BY ep.performed_at`,
        [ctx.tenantId, id],
      ),
    ]);

    const summary = this.toSummary(row);

    return {
      ...summary,
      notes: (notes.rows as Array<Record<string, unknown>>).map((n) => ({
        id: n.id as string,
        encounterId: n.encounterId as string,
        kind: n.kind as EncounterDetail['notes'][number]['kind'],
        title: (n.title as string) ?? null,
        body: (n.body as string) ?? '',
        structured: (n.structured as Record<string, unknown>) ?? null,
        status: n.status as EncounterDetail['notes'][number]['status'],
        author: n.authorId ? { id: n.authorId as string, name: (n.authorName as string) ?? '' } : null,
        signedAt: n.signedAt ? (n.signedAt as Date).toISOString() : null,
        supersedesNoteId: (n.supersedesNoteId as string) ?? null,
        supersededByNoteId: (n.supersededByNoteId as string) ?? null,
        version: n.version as number,
        occurredAt: (n.occurredAt as Date).toISOString(),
        createdAt: (n.createdAt as Date).toISOString(),
      })),
      observations: (observations.rows as Array<Record<string, unknown>>).map((o) => ({
        ...o,
        measuredAt: (o.measuredAt as Date).toISOString(),
      })) as EncounterDetail['observations'],
      diagnoses: (diagnoses.rows as Array<Record<string, unknown>>).map((d) => ({
        ...d,
        recordedAt: (d.recordedAt as Date).toISOString(),
      })) as EncounterDetail['diagnoses'],
      procedures: (procedures.rows as Array<Record<string, unknown>>).map((p) => ({
        ...p,
        performedAt: (p.performedAt as Date).toISOString(),
      })) as EncounterDetail['procedures'],
      weightKg: row.weight_kg,
      followUpDueAt: row.follow_up_due_at ? row.follow_up_due_at.toISOString().slice(0, 10) : null,
      followUpReason: row.follow_up_reason,
      followUpAppointmentId: row.follow_up_appointment_id,
      referral: row.referral,
      integrityHash: row.integrity_hash,
      finishedByName: row.finished_by_name,
      reopenedAt: row.reopened_at?.toISOString() ?? null,
      reopenReason: row.reopen_reason,
      version: row.row_version,
      redacted: !canReadSensitive,
    };
  }

  /** Atendimento sem agendamento (walk-in, urgência). */
  async create(ctx: RequestContext, input: CreateEncounter): Promise<EncounterDetail> {
    const id = await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const facilityId = input.facilityId ?? ctx.facilityId;
      if (!facilityId) throw AppError.validation('Selecione a unidade.');

      const patient = await tx.query<{ id: string; status: string }>(
        `SELECT id, status FROM registry.patients WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [input.patientId, ctx.tenantId],
      );
      if (!patient.rows[0]) throw AppError.notFound('Paciente');
      if (patient.rows[0].status === 'deceased') {
        throw AppError.conflict('Não é possível abrir atendimento para paciente com óbito registrado.');
      }

      const encounterId = uuidv7();
      const numberResult = await tx.query<{ next_number: string }>(
        `SELECT platform.next_number($1, 'encounter') AS next_number`,
        [ctx.tenantId],
      );

      await tx.query(
        `INSERT INTO clinical.encounters
           (id, tenant_id, facility_id, number, patient_id, appointment_id, service_id, class, status,
            attending_professional_id, arrived_at, chief_complaint, follow_up_of_encounter_id, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'arrived',$9, now(), $10, $11, $12, $12)`,
        [
          encounterId,
          ctx.tenantId,
          facilityId,
          numberResult.rows[0]?.next_number ?? '1',
          input.patientId,
          input.appointmentId ?? null,
          input.serviceId ?? null,
          input.class,
          input.attendingProfessionalId ?? ctx.professionalId,
          input.chiefComplaint ?? null,
          input.followUpOfEncounterId ?? null,
          ctx.user.id,
        ],
      );

      if (input.appointmentId) {
        await tx.query(
          `UPDATE scheduling.appointments SET encounter_id = $3, status = 'checked_in', checked_in_at = now()
            WHERE id = $1 AND tenant_id = $2 AND encounter_id IS NULL`,
          [input.appointmentId, ctx.tenantId, encounterId],
        );
      }

      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'encounter.create',
        entitySchema: 'clinical',
        entityTable: 'encounters',
        entityId: encounterId,
        after: { patientId: input.patientId, class: input.class },
      });
      await this.audit.publish(tx, ctx, {
        aggregateTable: 'clinical.encounters',
        aggregateId: encounterId,
        eventType: 'encounter.created',
        payload: { patientId: input.patientId },
      });

      return encounterId;
    });

    return this.get(ctx, id);
  }

  async transition(ctx: RequestContext, id: string, to: EncounterStatus, reason?: string): Promise<EncounterDetail> {
    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const current = await this.lockEncounter(tx, ctx, id);
      assertEncounterTransition(current.status as EncounterStatus, to);

      await tx.query(
        `UPDATE clinical.encounters
            SET status = $3,
                started_at = CASE WHEN $3 = 'in_progress' AND started_at IS NULL THEN now() ELSE started_at END,
                cancel_reason = CASE WHEN $3 = 'cancelled' THEN $4 ELSE cancel_reason END,
                ended_at = CASE WHEN $3 = 'cancelled' THEN now() ELSE ended_at END,
                attending_professional_id = CASE
                  WHEN $3 = 'in_progress' AND attending_professional_id IS NULL THEN $5
                  ELSE attending_professional_id END,
                row_version = row_version + 1,
                updated_by = $6
          WHERE id = $1 AND tenant_id = $2`,
        [id, ctx.tenantId, to, reason ?? null, ctx.professionalId, ctx.user.id],
      );

      // agenda acompanha o atendimento
      if (current.appointment_id) {
        if (to === 'in_progress') {
          await tx.query(
            `UPDATE scheduling.appointments SET status = 'in_service', row_version = row_version + 1
              WHERE id = $1 AND tenant_id = $2 AND status = 'checked_in'`,
            [current.appointment_id, ctx.tenantId],
          );
        } else if (to === 'cancelled') {
          await tx.query(
            `UPDATE scheduling.appointments
                SET status = 'cancelled', cancelled_at = now(), cancel_reason = $3, row_version = row_version + 1
              WHERE id = $1 AND tenant_id = $2 AND status IN ('checked_in','in_service')`,
            [current.appointment_id, ctx.tenantId, reason ?? 'Atendimento cancelado'],
          );
        }
      }

      await this.audit.record(tx, ctx, {
        category: to === 'cancelled' ? 'cancel' : 'mutation',
        action: `encounter.${to}`,
        entitySchema: 'clinical',
        entityTable: 'encounters',
        entityId: id,
        reason: reason ?? null,
      });

      if (to === 'in_progress' && !current.started_at) {
        await this.audit.publish(tx, ctx, {
          aggregateTable: 'clinical.encounters',
          aggregateId: id,
          eventType: 'encounter.started',
          payload: { patientId: current.patient_id },
        });
      }
    });

    return this.get(ctx, id);
  }

  /** Triagem: cria a nota e as observações, movendo `arrived` para `triaged`. */
  async triage(
    ctx: RequestContext,
    id: string,
    input: { note?: string; observations?: RecordObservations['items'] },
  ): Promise<EncounterDetail> {
    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const current = await this.lockEncounter(tx, ctx, id);
      assertEncounterWritable(current.status as EncounterStatus);

      if (input.note) {
        await this.upsertNoteInTx(tx, ctx, id, current.patient_id, { kind: 'triage', body: input.note });
      }
      if (input.observations?.length) {
        await this.recordObservationsInTx(tx, ctx, id, current.patient_id, input.observations);
      }
      if (current.status === 'arrived') {
        await tx.query(
          `UPDATE clinical.encounters SET status = 'triaged', row_version = row_version + 1, updated_by = $3
            WHERE id = $1 AND tenant_id = $2`,
          [id, ctx.tenantId, ctx.user.id],
        );
      }

      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'encounter.triage',
        entitySchema: 'clinical',
        entityTable: 'encounters',
        entityId: id,
      });
    });

    return this.get(ctx, id);
  }

  async upsertNote(ctx: RequestContext, id: string, input: UpsertNote): Promise<EncounterDetail> {
    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const current = await this.lockEncounter(tx, ctx, id);
      assertEncounterWritable(current.status as EncounterStatus);
      await this.upsertNoteInTx(tx, ctx, id, current.patient_id, input);

      if (input.kind === 'chief_complaint' && input.body) {
        await tx.query(`UPDATE clinical.encounters SET chief_complaint = $3 WHERE id = $1 AND tenant_id = $2`, [
          id,
          ctx.tenantId,
          input.body.slice(0, 500),
        ]);
      }

      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'encounter.note.save',
        entitySchema: 'clinical',
        entityTable: 'encounter_notes',
        entityId: id,
        after: { kind: input.kind, length: input.body.length },
      });
    });

    return this.get(ctx, id);
  }

  private async upsertNoteInTx(
    tx: PoolClient,
    ctx: RequestContext,
    encounterId: string,
    patientId: string,
    input: UpsertNote,
  ): Promise<string> {
    const singleton = !['progress', 'addendum', 'free', 'nursing', 'procedure_note'].includes(input.kind);

    if (singleton) {
      const existing = await tx.query<{ id: string; version: number; status: string }>(
        `SELECT id, version, status FROM clinical.encounter_notes
          WHERE tenant_id = $1 AND encounter_id = $2 AND kind = $3 AND superseded_by_note_id IS NULL
            AND status IN ('draft','final')
          FOR UPDATE`,
        [ctx.tenantId, encounterId, input.kind],
      );
      const note = existing.rows[0];
      if (note) {
        if (note.status !== 'draft') {
          throw new AppError('ENCOUNTER_LOCKED', 'Esta seção já foi assinada. Registre um adendo.');
        }
        if (input.expectedVersion !== undefined && input.expectedVersion !== note.version) {
          throw AppError.conflict('A nota foi alterada por outra pessoa. Recarregue a página.', {
            currentVersion: note.version,
          });
        }
        await tx.query(
          `UPDATE clinical.encounter_notes
              SET body = $3, title = $4, structured = $5, version = version + 1, occurred_at = now()
            WHERE id = $1 AND tenant_id = $2`,
          [
            note.id,
            ctx.tenantId,
            input.body,
            input.title ?? null,
            input.structured ? JSON.stringify(input.structured) : null,
          ],
        );
        return note.id;
      }
    }

    const id = uuidv7();
    const sequenceResult = await tx.query<{ next_seq: number }>(
      `SELECT COALESCE(max(sequence), 0) + 1 AS next_seq FROM clinical.encounter_notes
        WHERE tenant_id = $1 AND encounter_id = $2`,
      [ctx.tenantId, encounterId],
    );

    await tx.query(
      `INSERT INTO clinical.encounter_notes
         (id, tenant_id, encounter_id, patient_id, kind, title, body, structured,
          author_professional_id, author_user_id, status, sequence)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft',$11)`,
      [
        id,
        ctx.tenantId,
        encounterId,
        patientId,
        input.kind,
        input.title ?? null,
        input.body,
        input.structured ? JSON.stringify(input.structured) : null,
        ctx.professionalId,
        ctx.user.id,
        sequenceResult.rows[0]?.next_seq ?? 1,
      ],
    );
    return id;
  }

  /** Adendo: cria nova nota e marca a anterior como emendada. */
  async amendNote(
    ctx: RequestContext,
    encounterId: string,
    noteId: string,
    input: { body: string; reason: string },
  ): Promise<EncounterDetail> {
    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const original = await tx.query<{ id: string; kind: string; patient_id: string; status: string }>(
        `SELECT id, kind, patient_id, status FROM clinical.encounter_notes
          WHERE id = $1 AND tenant_id = $2 AND encounter_id = $3 FOR UPDATE`,
        [noteId, ctx.tenantId, encounterId],
      );
      const note = original.rows[0];
      if (!note) throw AppError.notFound('Nota clínica');
      if (note.status !== 'final') throw AppError.conflict('Só notas assinadas recebem adendo.');

      const newId = uuidv7();
      const sequenceResult = await tx.query<{ next_seq: number }>(
        `SELECT COALESCE(max(sequence), 0) + 1 AS next_seq FROM clinical.encounter_notes
          WHERE tenant_id = $1 AND encounter_id = $2`,
        [ctx.tenantId, encounterId],
      );

      // A nota anterior é marcada antes da inserção: o índice único de nota
      // ativa por tipo é imediato, então as duas não podem coexistir ativas.
      await tx.query(
        `UPDATE clinical.encounter_notes
            SET status = 'amended', superseded_by_note_id = $3, superseded_at = now()
          WHERE id = $1 AND tenant_id = $2`,
        [noteId, ctx.tenantId, newId],
      );

      await tx.query(
        `INSERT INTO clinical.encounter_notes
           (id, tenant_id, encounter_id, patient_id, kind, title, body, author_professional_id,
            author_user_id, status, signed_at, signed_by, supersedes_note_id, sequence)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'final', now(), $9, $10, $11)`,
        [
          newId,
          ctx.tenantId,
          encounterId,
          note.patient_id,
          note.kind,
          `Adendo: ${input.reason}`.slice(0, 160),
          input.body,
          ctx.professionalId,
          ctx.user.id,
          noteId,
          sequenceResult.rows[0]?.next_seq ?? 1,
        ],
      );

      await this.audit.record(tx, ctx, {
        category: 'sign',
        action: 'encounter.note.amend',
        entitySchema: 'clinical',
        entityTable: 'encounter_notes',
        entityId: newId,
        reason: input.reason,
        before: { supersededNoteId: noteId },
      });
      await this.audit.publish(tx, ctx, {
        aggregateTable: 'clinical.encounter_notes',
        aggregateId: newId,
        eventType: 'note.amended',
        payload: { encounterId, patientId: note.patient_id },
      });
    });

    return this.get(ctx, encounterId);
  }

  async recordObservations(ctx: RequestContext, id: string, input: RecordObservations): Promise<EncounterDetail> {
    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const current = await this.lockEncounter(tx, ctx, id);
      assertEncounterWritable(current.status as EncounterStatus);
      await this.recordObservationsInTx(tx, ctx, id, current.patient_id, input.items, input.measuredAt);
    });
    return this.get(ctx, id);
  }

  private async recordObservationsInTx(
    tx: PoolClient,
    ctx: RequestContext,
    encounterId: string,
    patientId: string,
    items: RecordObservations['items'],
    measuredAt?: string,
  ): Promise<void> {
    const patient = await tx.query<{
      species_id: string;
      species_code: string;
      birth_date: Date | null;
      estimated_age_months: number | null;
      sex: string;
      current_weight_kg: string | null;
    }>(
      `SELECT p.species_id, s.code AS species_code, p.birth_date, p.estimated_age_months, p.sex,
              p.current_weight_kg::text
         FROM registry.patients p JOIN registry.species s ON s.id = p.species_id
        WHERE p.id = $1 AND p.tenant_id = $2`,
      [patientId, ctx.tenantId],
    );
    const info = patient.rows[0];
    if (!info) throw AppError.notFound('Paciente');

    const ageMonths = info.birth_date
      ? Math.floor((Date.now() - info.birth_date.getTime()) / (30.44 * 86_400_000))
      : info.estimated_age_months;
    const stage = lifeStageFor(info.species_code, ageMonths ?? null);
    const weightKg = info.current_weight_kg ? Number(info.current_weight_kg) : null;

    for (const item of items) {
      const normalized = normalizeObservation({ code: item.code, value: item.value, uom: item.uom ?? null });

      const ranges = await tx.query<{
        id: string;
        min_value: string | null;
        max_value: string | null;
        life_stage: string | null;
        sex: string | null;
        weight_min_kg: string | null;
        weight_max_kg: string | null;
        validation_status: string;
      }>(
        `SELECT id, min_value::text, max_value::text, life_stage, sex,
                weight_min_kg::text, weight_max_kg::text, validation_status
           FROM registry.reference_ranges
          WHERE species_id = $1 AND parameter_code = $2 AND (tenant_id IS NULL OR tenant_id = $3)`,
        [info.species_id, normalized.code, ctx.tenantId],
      );

      let flag: string | null = null;
      let flagStatus: string | null = null;
      let rangeId: string | null = null;
      let refMin: number | null = null;
      let refMax: number | null = null;

      if (normalized.valueNumeric !== null && ranges.rows.length > 0) {
        const classification = classifyObservation(
          normalized.valueNumeric,
          ranges.rows.map((r) => ({
            minValue: r.min_value !== null ? Number(r.min_value) : null,
            maxValue: r.max_value !== null ? Number(r.max_value) : null,
            lifeStage: r.life_stage,
            sex: r.sex,
            weightMinKg: r.weight_min_kg !== null ? Number(r.weight_min_kg) : null,
            weightMaxKg: r.weight_max_kg !== null ? Number(r.weight_max_kg) : null,
            validationStatus: r.validation_status as 'unvalidated' | 'validated',
          })),
          { lifeStage: stage, sex: info.sex, weightKg },
        );
        flag = classification.flag;
        flagStatus = classification.status;
        if (classification.range) {
          refMin = classification.range.minValue;
          refMax = classification.range.maxValue;
          const matching = ranges.rows.find(
            (r) =>
              (r.min_value !== null ? Number(r.min_value) : null) === classification.range?.minValue &&
              (r.max_value !== null ? Number(r.max_value) : null) === classification.range?.maxValue,
          );
          rangeId = matching?.id ?? null;
        }
      }

      const observationId = uuidv7();
      await tx.query(
        `INSERT INTO clinical.observations
           (id, tenant_id, patient_id, encounter_id, code, value_numeric, value_text, value_code, uom,
            entered_value, entered_uom, method, measured_at, measured_by_professional_id, measured_by_user_id,
            abnormal_flag, abnormal_flag_status, reference_range_id, reference_min, reference_max, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,COALESCE($13, now()),$14,$15,$16,$17,$18,$19,$20,$21)`,
        [
          observationId,
          ctx.tenantId,
          patientId,
          encounterId,
          normalized.code,
          normalized.valueNumeric,
          normalized.valueText,
          normalized.valueCode,
          normalized.uom,
          normalized.enteredValue,
          normalized.enteredUom,
          item.method ?? null,
          measuredAt ?? null,
          ctx.professionalId,
          ctx.user.id,
          flag,
          flagStatus,
          rangeId,
          refMin,
          refMax,
          item.notes ?? null,
        ],
      );

      if (normalized.code === 'weight' && normalized.valueNumeric) {
        await tx.query(
          `UPDATE registry.patients SET current_weight_kg = $3, current_weight_at = now()
            WHERE id = $1 AND tenant_id = $2`,
          [patientId, ctx.tenantId, normalized.valueNumeric],
        );
        await tx.query(`UPDATE clinical.encounters SET weight_kg = $3 WHERE id = $1 AND tenant_id = $2`, [
          encounterId,
          ctx.tenantId,
          normalized.valueNumeric,
        ]);
      }
    }

    await this.audit.record(tx, ctx, {
      category: 'mutation',
      action: 'encounter.observations',
      entitySchema: 'clinical',
      entityTable: 'observations',
      entityId: encounterId,
      after: { codes: items.map((i) => i.code) },
    });
  }

  async addDiagnosis(ctx: RequestContext, id: string, input: Record<string, unknown>) {
    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const current = await this.lockEncounter(tx, ctx, id);
      assertEncounterWritable(current.status as EncounterStatus);

      const diagnosisId = uuidv7();
      await tx.query(
        `INSERT INTO clinical.encounter_diagnoses
           (id, tenant_id, encounter_id, patient_id, condition_id, description, kind, rank, notes,
            recorded_by, recorded_by_professional_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          diagnosisId,
          ctx.tenantId,
          id,
          current.patient_id,
          input.conditionId ?? null,
          input.description,
          input.kind ?? 'presumptive',
          input.rank ?? 1,
          input.notes ?? null,
          ctx.user.id,
          ctx.professionalId,
        ],
      );

      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'encounter.diagnosis.add',
        entitySchema: 'clinical',
        entityTable: 'encounter_diagnoses',
        entityId: diagnosisId,
      });
    });
    return this.get(ctx, id);
  }

  async removeDiagnosis(ctx: RequestContext, id: string, diagnosisId: string) {
    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const current = await this.lockEncounter(tx, ctx, id);
      assertEncounterWritable(current.status as EncounterStatus);
      await tx.query(`DELETE FROM clinical.encounter_diagnoses WHERE id = $1 AND tenant_id = $2 AND encounter_id = $3`, [
        diagnosisId,
        ctx.tenantId,
        id,
      ]);
    });
    return this.get(ctx, id);
  }

  async addProcedure(ctx: RequestContext, id: string, input: Record<string, unknown>) {
    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const current = await this.lockEncounter(tx, ctx, id);
      assertEncounterWritable(current.status as EncounterStatus);
      const procedureId = uuidv7();
      await tx.query(
        `INSERT INTO clinical.encounter_procedures
           (id, tenant_id, encounter_id, patient_id, service_id, description, performed_at,
            performed_by, performed_by_professional_id, notes)
         VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7, now()),$8,$9,$10)`,
        [
          procedureId,
          ctx.tenantId,
          id,
          current.patient_id,
          input.serviceId ?? null,
          input.description,
          input.performedAt ?? null,
          ctx.user.id,
          ctx.professionalId,
          input.notes ?? null,
        ],
      );
    });
    return this.get(ctx, id);
  }

  /**
   * Finalização: valida conteúdo mínimo por tipo de serviço, assina as notas,
   * trava o atendimento, gera itens de cobrança e registra o retorno.
   */
  async finish(ctx: RequestContext, id: string, input: FinishEncounter): Promise<EncounterDetail> {
    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const current = await this.lockEncounter(tx, ctx, id);
      assertEncounterTransition(current.status as EncounterStatus, 'finished');

      if (input.expectedVersion !== undefined && input.expectedVersion !== current.row_version) {
        throw AppError.conflict('O atendimento foi alterado por outra pessoa. Recarregue a página.', {
          currentVersion: current.row_version,
        });
      }

      // política de dono: só o profissional responsável assina
      if (
        current.attending_professional_id &&
        ctx.professionalId &&
        current.attending_professional_id !== ctx.professionalId &&
        !ctx.permissions.has('encounter:reassign')
      ) {
        throw new AppError('NOT_OWNER', 'Apenas o profissional responsável pode finalizar este atendimento.');
      }

      const snapshot = await this.contentSnapshot(tx, ctx, id, input.minimumContentJustification);
      const category = (current.service_category ?? 'consultation') as ServiceCategory;
      assertMinimumContent(category, snapshot);

      // assina as notas em rascunho
      const notes = await tx.query<{ id: string; kind: string; body: string }>(
        `SELECT id, kind, body FROM clinical.encounter_notes
          WHERE tenant_id = $1 AND encounter_id = $2 AND status = 'draft'`,
        [ctx.tenantId, id],
      );
      for (const note of notes.rows) {
        if (!note.body.trim()) {
          await tx.query(`DELETE FROM clinical.encounter_notes WHERE id = $1 AND tenant_id = $2`, [
            note.id,
            ctx.tenantId,
          ]);
          continue;
        }
        await tx.query(
          `UPDATE clinical.encounter_notes
              SET status = 'final', signed_at = now(), signed_by = $3
            WHERE id = $1 AND tenant_id = $2`,
          [note.id, ctx.tenantId, ctx.user.id],
        );
      }

      const finalDiagnoses = await tx.query<{ description: string }>(
        `SELECT description FROM clinical.encounter_diagnoses
          WHERE tenant_id = $1 AND encounter_id = $2 AND kind IN ('final','presumptive')
          ORDER BY CASE kind WHEN 'final' THEN 0 ELSE 1 END, rank LIMIT 3`,
        [ctx.tenantId, id],
      );
      const summary = finalDiagnoses.rows.map((d) => d.description).join('; ') || null;

      const integrityPayload = JSON.stringify({
        encounterId: id,
        notes: notes.rows.map((n) => ({ kind: n.kind, body: n.body })),
        diagnoses: finalDiagnoses.rows,
        signedBy: ctx.user.id,
        signedAt: new Date().toISOString(),
      });
      const integrityHash = createHash('sha256').update(integrityPayload).digest('hex');

      await tx.query(
        `UPDATE clinical.encounters
            SET status = 'finished', ended_at = now(), finished_at = now(), finished_by = $3,
                disposition = $4, follow_up_due_at = $5, follow_up_reason = $6, referral = $7,
                primary_diagnosis_summary = $8, integrity_hash = $9,
                row_version = row_version + 1, updated_by = $3
          WHERE id = $1 AND tenant_id = $2`,
        [
          id,
          ctx.tenantId,
          ctx.user.id,
          input.disposition,
          input.followUpDueAt ?? null,
          input.followUpReason ?? null,
          input.referral ? JSON.stringify(input.referral) : null,
          summary,
          integrityHash,
        ],
      );

      if (current.appointment_id) {
        await tx.query(
          `UPDATE scheduling.appointments SET status = 'completed', row_version = row_version + 1
            WHERE id = $1 AND tenant_id = $2 AND status IN ('checked_in','in_service')`,
          [current.appointment_id, ctx.tenantId],
        );
      }

      await this.generateChargeItems(tx, ctx, id, current);

      await this.audit.record(tx, ctx, {
        category: 'sign',
        action: 'encounter.finish',
        entitySchema: 'clinical',
        entityTable: 'encounters',
        entityId: id,
        after: { disposition: input.disposition, integrityHash, notes: notes.rowCount },
      });
      await this.audit.publish(tx, ctx, {
        aggregateTable: 'clinical.encounters',
        aggregateId: id,
        eventType: 'encounter.finished',
        payload: { patientId: current.patient_id, disposition: input.disposition },
      });
    });

    return this.get(ctx, id);
  }

  async reopen(ctx: RequestContext, id: string, reason: string): Promise<EncounterDetail> {
    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const current = await this.lockEncounter(tx, ctx, id);
      assertEncounterTransition(current.status as EncounterStatus, 'in_progress');

      await tx.query(
        `UPDATE clinical.encounters
            SET status = 'in_progress', ended_at = NULL, reopened_at = now(), reopened_by = $3,
                reopen_reason = $4, row_version = row_version + 1, updated_by = $3
          WHERE id = $1 AND tenant_id = $2`,
        [id, ctx.tenantId, ctx.user.id, reason],
      );

      await this.audit.record(tx, ctx, {
        category: 'reopen',
        action: 'encounter.reopen',
        entitySchema: 'clinical',
        entityTable: 'encounters',
        entityId: id,
        reason,
      });
    });

    return this.get(ctx, id);
  }

  async listCharges(ctx: RequestContext, id: string) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query(
        `SELECT id, description, quantity::text, unit_price::text AS "unitPrice", total::text,
                status, COALESCE(source_table, 'manual') AS origin, occurred_at AS "occurredAt"
           FROM billing.charge_items
          WHERE tenant_id = $1 AND encounter_id = $2 AND status <> 'cancelled'
          ORDER BY occurred_at`,
        [ctx.tenantId, id],
      );
      return {
        items: rows.map((r) => ({ ...(r as Record<string, unknown>), occurredAt: (r as { occurredAt: Date }).occurredAt.toISOString() })),
      };
    });
  }

  async settleChargesExternally(ctx: RequestContext, id: string) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rowCount } = await tx.query(
        `UPDATE billing.charge_items SET status = 'settled_externally'
          WHERE tenant_id = $1 AND encounter_id = $2 AND status = 'pending'`,
        [ctx.tenantId, id],
      );
      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'charge.settle_externally',
        entitySchema: 'billing',
        entityTable: 'charge_items',
        entityId: id,
        after: { count: rowCount },
      });
      return { settled: rowCount ?? 0 };
    });
  }

  private async generateChargeItems(
    tx: PoolClient,
    ctx: RequestContext,
    encounterId: string,
    encounter: { facility_id: string; patient_id: string; service_id: string | null },
  ): Promise<void> {
    const guardian = await tx.query<{ guardian_id: string }>(
      `SELECT guardian_id FROM registry.patient_guardians
        WHERE tenant_id = $1 AND patient_id = $2 AND valid_to IS NULL
        ORDER BY is_primary DESC LIMIT 1`,
      [ctx.tenantId, encounter.patient_id],
    );
    const payerId = guardian.rows[0]?.guardian_id ?? null;

    const insertCharge = async (params: {
      description: string;
      serviceId?: string | null;
      quantity?: number;
      unitPrice?: string | null;
      sourceTable?: string;
      sourceId?: string;
    }) => {
      await tx.query(
        `INSERT INTO billing.charge_items
           (id, tenant_id, facility_id, patient_id, payer_guardian_id, encounter_id, source_table, source_id,
            service_id, description, quantity, unit_price, total, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
                 CASE WHEN $12::numeric IS NULL THEN NULL ELSE $12::numeric * $11 END,
                 'pending',$13)`,
        [
          uuidv7(),
          ctx.tenantId,
          encounter.facility_id,
          encounter.patient_id,
          payerId,
          encounterId,
          params.sourceTable ?? null,
          params.sourceId ?? null,
          params.serviceId ?? null,
          params.description,
          params.quantity ?? 1,
          params.unitPrice ?? null,
          ctx.user.id,
        ],
      );
    };

    const existing = await tx.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM billing.charge_items WHERE tenant_id = $1 AND encounter_id = $2`,
      [ctx.tenantId, encounterId],
    );
    if (Number(existing.rows[0]?.count ?? '0') > 0) return;

    if (encounter.service_id) {
      const service = await tx.query<{ name: string; default_price: string | null }>(
        `SELECT name, default_price::text FROM registry.service_catalog WHERE id = $1 AND tenant_id = $2`,
        [encounter.service_id, ctx.tenantId],
      );
      const svc = service.rows[0];
      if (svc) {
        await insertCharge({
          description: svc.name,
          serviceId: encounter.service_id,
          unitPrice: svc.default_price,
          sourceTable: 'clinical.encounters',
          sourceId: encounterId,
        });
      }
    }

    const procedures = await tx.query<{ id: string; description: string; service_id: string | null; price: string | null }>(
      `SELECT ep.id, ep.description, ep.service_id, sc.default_price::text AS price
         FROM clinical.encounter_procedures ep
         LEFT JOIN registry.service_catalog sc ON sc.id = ep.service_id AND sc.tenant_id = ep.tenant_id
        WHERE ep.tenant_id = $1 AND ep.encounter_id = $2`,
      [ctx.tenantId, encounterId],
    );
    for (const proc of procedures.rows) {
      await insertCharge({
        description: proc.description,
        serviceId: proc.service_id,
        unitPrice: proc.price,
        sourceTable: 'clinical.encounter_procedures',
        sourceId: proc.id,
      });
    }

    const immunizations = await tx.query<{ id: string; vaccine_name: string }>(
      `SELECT id, vaccine_name FROM immunization.immunizations
        WHERE tenant_id = $1 AND encounter_id = $2 AND status = 'completed'`,
      [ctx.tenantId, encounterId],
    );
    for (const imm of immunizations.rows) {
      await insertCharge({
        description: `Vacina: ${imm.vaccine_name}`,
        sourceTable: 'immunization.immunizations',
        sourceId: imm.id,
      });
    }

    const exams = await tx.query<{ id: string; name: string }>(
      `SELECT eoi.id, ec.name FROM lab.exam_order_items eoi
         JOIN lab.exam_orders eo ON eo.id = eoi.exam_order_id AND eo.tenant_id = eoi.tenant_id
         JOIN lab.exam_catalog ec ON ec.id = eoi.exam_catalog_id
        WHERE eoi.tenant_id = $1 AND eo.encounter_id = $2 AND eoi.status <> 'cancelled'`,
      [ctx.tenantId, encounterId],
    );
    for (const exam of exams.rows) {
      await insertCharge({
        description: `Exame: ${exam.name}`,
        sourceTable: 'lab.exam_order_items',
        sourceId: exam.id,
      });
    }
  }

  private async contentSnapshot(
    tx: PoolClient,
    ctx: RequestContext,
    encounterId: string,
    justification?: string | null,
  ): Promise<EncounterContentSnapshot> {
    const { rows } = await tx.query<{
      assessment: string;
      any_note: string;
      triage: string;
      procedure_note: string;
      diagnoses: string;
      procedures: string;
      immunizations: string;
      exams: string;
      observations: string;
    }>(
      `SELECT
        (SELECT count(*) FROM clinical.encounter_notes n WHERE n.tenant_id = $1 AND n.encounter_id = $2
           AND n.kind = 'assessment' AND n.body <> '' AND n.status <> 'entered_in_error')::text AS assessment,
        (SELECT count(*) FROM clinical.encounter_notes n WHERE n.tenant_id = $1 AND n.encounter_id = $2
           AND n.body <> '' AND n.status <> 'entered_in_error')::text AS any_note,
        (SELECT count(*) FROM clinical.encounter_notes n WHERE n.tenant_id = $1 AND n.encounter_id = $2
           AND n.kind = 'triage' AND n.body <> '')::text AS triage,
        (SELECT count(*) FROM clinical.encounter_notes n WHERE n.tenant_id = $1 AND n.encounter_id = $2
           AND n.kind IN ('procedure_note','anesthesia_note') AND n.body <> '')::text AS procedure_note,
        (SELECT count(*) FROM clinical.encounter_diagnoses d WHERE d.tenant_id = $1 AND d.encounter_id = $2)::text AS diagnoses,
        (SELECT count(*) FROM clinical.encounter_procedures p WHERE p.tenant_id = $1 AND p.encounter_id = $2)::text AS procedures,
        (
          (SELECT count(*) FROM immunization.immunizations i WHERE i.tenant_id = $1 AND i.encounter_id = $2
             AND i.status = 'completed')
          + (SELECT count(*) FROM immunization.preventive_treatments pt
              WHERE pt.tenant_id = $1 AND pt.encounter_id = $2)
        )::text AS immunizations,
        (SELECT count(*) FROM lab.exam_orders o WHERE o.tenant_id = $1 AND o.encounter_id = $2
           AND o.status <> 'cancelled')::text AS exams,
        (SELECT count(*) FROM clinical.observations ob WHERE ob.tenant_id = $1 AND ob.encounter_id = $2)::text AS observations`,
      [ctx.tenantId, encounterId],
    );

    const r = rows[0];
    return {
      hasAssessmentNote: Number(r?.assessment ?? '0') > 0,
      hasAnyNote: Number(r?.any_note ?? '0') > 0,
      hasTriageNote: Number(r?.triage ?? '0') > 0,
      hasProcedureNote: Number(r?.procedure_note ?? '0') > 0,
      diagnosisCount: Number(r?.diagnoses ?? '0'),
      procedureCount: Number(r?.procedures ?? '0'),
      immunizationCount: Number(r?.immunizations ?? '0'),
      examOrderCount: Number(r?.exams ?? '0'),
      observationCount: Number(r?.observations ?? '0'),
      justification: justification ?? null,
    };
  }

  private async lockEncounter(tx: PoolClient, ctx: RequestContext, id: string) {
    const { rows } = await tx.query<{
      id: string;
      status: string;
      patient_id: string;
      appointment_id: string | null;
      attending_professional_id: string | null;
      facility_id: string;
      service_id: string | null;
      service_category: string | null;
      row_version: number;
      started_at: Date | null;
    }>(
      `SELECT e.id, e.status, e.patient_id, e.appointment_id, e.attending_professional_id, e.facility_id,
              e.service_id, sc.category AS service_category, e.row_version, e.started_at
         FROM clinical.encounters e
         LEFT JOIN registry.service_catalog sc ON sc.id = e.service_id AND sc.tenant_id = e.tenant_id
        WHERE e.id = $1 AND e.tenant_id = $2
        FOR UPDATE OF e`,
      [id, ctx.tenantId],
    );
    const row = rows[0];
    if (!row) throw AppError.notFound('Atendimento');

    const scope = facilityScope(ctx);
    if (scope && !scope.includes(row.facility_id)) {
      throw AppError.forbidden('Atendimento de outra unidade.');
    }
    return row;
  }
}
