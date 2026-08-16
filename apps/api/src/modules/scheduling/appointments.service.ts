import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { assertAppointmentTransition, type AppointmentStatus } from '@chiron/domain';
import { ageLabel } from '@chiron/domain';
import type { Appointment, CheckIn, CreateAppointment } from '@chiron/contracts';
import { DatabaseService } from '../../database/database.service';
import { AuditService } from '../../common/audit.service';
import { AppError } from '../../common/errors';
import { uuidv7 } from '../../common/uuid';
import type { RequestContext } from '../../common/request-context';
import { contextToTenantContext, facilityScope } from '../../common/request-context';
import { PatientsService } from '../registry/patients.service';

const APPOINTMENT_SELECT = `
  a.id, a.number::text AS number, a.facility_id, a.status, a.priority, a.start_at, a.end_at,
  a.reason, a.notes, a.source, a.confirmed_at, a.checked_in_at, a.cancelled_at, a.cancel_reason,
  a.encounter_id, a.origin_encounter_id, a.created_at, a.row_version,
  p.id AS patient_id, p.name AS patient_name, p.birth_date AS patient_birth_date,
  p.estimated_age_months AS patient_age_months, p.sex AS patient_sex,
  ps.name_pt AS patient_species, pb.name AS patient_breed,
  g.id AS guardian_id, g.name AS guardian_name, g.phone_primary AS guardian_phone,
  pr.id AS professional_id, pr.name AS professional_name, pr.color AS professional_color,
  sc.id AS service_id, sc.name AS service_name, sc.category AS service_category
`;

const APPOINTMENT_FROM = `
  FROM scheduling.appointments a
  JOIN registry.service_catalog sc ON sc.id = a.service_id AND sc.tenant_id = a.tenant_id
  LEFT JOIN registry.patients p ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
  LEFT JOIN registry.species ps ON ps.id = p.species_id
  LEFT JOIN registry.breeds pb ON pb.id = p.breed_id
  LEFT JOIN registry.guardians g ON g.id = a.guardian_id AND g.tenant_id = a.tenant_id
  LEFT JOIN registry.professionals pr ON pr.id = a.professional_id AND pr.tenant_id = a.tenant_id
`;

interface AppointmentRow {
  id: string;
  number: string;
  facility_id: string;
  status: string;
  priority: string;
  start_at: Date;
  end_at: Date;
  reason: string | null;
  notes: string | null;
  source: string;
  confirmed_at: Date | null;
  checked_in_at: Date | null;
  cancelled_at: Date | null;
  cancel_reason: string | null;
  encounter_id: string | null;
  origin_encounter_id: string | null;
  created_at: Date;
  row_version: number;
  patient_id: string | null;
  patient_name: string | null;
  patient_birth_date: Date | null;
  patient_age_months: number | null;
  patient_sex: string | null;
  patient_species: string | null;
  patient_breed: string | null;
  guardian_id: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  professional_id: string | null;
  professional_name: string | null;
  professional_color: string | null;
  service_id: string;
  service_name: string;
  service_category: string;
}

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly patients: PatientsService,
  ) {}

  private toDto(row: AppointmentRow): Appointment {
    return {
      id: row.id,
      number: Number(row.number),
      facilityId: row.facility_id,
      patient: row.patient_id
        ? {
            id: row.patient_id,
            name: row.patient_name ?? '',
            speciesName: row.patient_species ?? '',
            breedName: row.patient_breed,
            sex: (row.patient_sex ?? 'unknown') as Appointment['patient'] extends null ? never : 'unknown',
            ageLabel: ageLabel(row.patient_birth_date, row.patient_age_months),
          }
        : null,
      guardian: row.guardian_id
        ? { id: row.guardian_id, name: row.guardian_name ?? '', phone: row.guardian_phone }
        : null,
      professional: row.professional_id
        ? { id: row.professional_id, name: row.professional_name ?? '', color: row.professional_color }
        : null,
      service: {
        id: row.service_id,
        name: row.service_name,
        category: row.service_category as Appointment['service']['category'],
      },
      status: row.status as Appointment['status'],
      priority: row.priority as Appointment['priority'],
      startAt: row.start_at.toISOString(),
      endAt: row.end_at.toISOString(),
      reason: row.reason,
      notes: row.notes,
      source: row.source as Appointment['source'],
      confirmedAt: row.confirmed_at?.toISOString() ?? null,
      checkedInAt: row.checked_in_at?.toISOString() ?? null,
      cancelledAt: row.cancelled_at?.toISOString() ?? null,
      cancelReason: row.cancel_reason,
      encounterId: row.encounter_id,
      originEncounterId: row.origin_encounter_id,
      createdAt: row.created_at.toISOString(),
      version: row.row_version,
    };
  }

  async list(
    ctx: RequestContext,
    params: {
      from?: string;
      to?: string;
      facilityId?: string;
      professionalId?: string;
      patientId?: string;
      status?: string;
      q?: string;
      limit: number;
    },
  ): Promise<{ items: Appointment[] }> {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const scope = facilityScope(ctx);
      const { rows } = await tx.query<AppointmentRow>(
        `SELECT ${APPOINTMENT_SELECT} ${APPOINTMENT_FROM}
          WHERE a.tenant_id = $1
            AND ($2::timestamptz IS NULL OR a.start_at >= $2)
            AND ($3::timestamptz IS NULL OR a.start_at < $3)
            AND ($4::uuid IS NULL OR a.facility_id = $4)
            AND ($5::uuid IS NULL OR a.professional_id = $5)
            AND ($6::uuid IS NULL OR a.patient_id = $6)
            AND ($7::text IS NULL OR a.status = $7)
            AND ($8::text IS NULL OR p.name ILIKE '%' || $8 || '%' OR g.name ILIKE '%' || $8 || '%')
            AND ($9::uuid[] IS NULL OR a.facility_id = ANY($9))
          ORDER BY a.start_at
          LIMIT $10`,
        [
          ctx.tenantId,
          params.from ?? null,
          params.to ?? null,
          params.facilityId ?? null,
          params.professionalId ?? null,
          params.patientId ?? null,
          params.status ?? null,
          params.q ?? null,
          scope,
          params.limit,
        ],
      );
      return { items: rows.map((r) => this.toDto(r)) };
    });
  }

  async get(ctx: RequestContext, id: string): Promise<Appointment> {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query<AppointmentRow>(
        `SELECT ${APPOINTMENT_SELECT} ${APPOINTMENT_FROM} WHERE a.tenant_id = $1 AND a.id = $2`,
        [ctx.tenantId, id],
      );
      const row = rows[0];
      if (!row) throw AppError.notFound('Agendamento');
      return this.toDto(row);
    });
  }

  async create(ctx: RequestContext, input: CreateAppointment): Promise<Appointment> {
    const id = await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const facilityId = input.facilityId ?? ctx.facilityId;
      if (!facilityId) throw AppError.validation('Selecione a unidade.');
      this.assertFacilityAllowed(ctx, facilityId);

      const service = await tx.query<{ id: string; default_duration_min: number; requires_professional: boolean }>(
        `SELECT id, default_duration_min, requires_professional FROM registry.service_catalog
          WHERE id = $1 AND tenant_id = $2 AND active`,
        [input.serviceId, ctx.tenantId],
      );
      const svc = service.rows[0];
      if (!svc) throw AppError.validation('Serviço inválido.');
      if (svc.requires_professional && !input.professionalId) {
        throw AppError.validation('Selecione o profissional para este serviço.');
      }

      const startAt = new Date(input.startAt);
      const endAt = input.endAt
        ? new Date(input.endAt)
        : new Date(startAt.getTime() + svc.default_duration_min * 60_000);

      if (endAt <= startAt) throw AppError.validation('O horário final deve ser depois do inicial.');

      const blocked = await tx.query<{ id: string }>(
        `SELECT id FROM scheduling.schedule_blocks
          WHERE tenant_id = $1 AND facility_id = $2
            AND ($3::uuid IS NULL OR professional_id IS NULL OR professional_id = $3)
            AND tstzrange(start_at, end_at, '[)') && tstzrange($4, $5, '[)')
          LIMIT 1`,
        [ctx.tenantId, facilityId, input.professionalId ?? null, startAt, endAt],
      );
      if (blocked.rowCount) throw AppError.conflict('Existe um bloqueio de agenda nesse horário.');

      const appointmentId = uuidv7();
      const numberResult = await tx.query<{ next_number: string }>(
        `SELECT platform.next_number($1, 'appointment') AS next_number`,
        [ctx.tenantId],
      );

      await tx.query(
        `INSERT INTO scheduling.appointments
           (id, tenant_id, facility_id, number, patient_id, guardian_id, professional_id, service_id,
            status, priority, start_at, end_at, reason, notes, source, origin_encounter_id, allow_overlap,
            created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'scheduled',$9,$10,$11,$12,$13,$14,$15,$16,$17,$17)`,
        [
          appointmentId,
          ctx.tenantId,
          facilityId,
          numberResult.rows[0]?.next_number ?? '1',
          input.patientId ?? null,
          input.guardianId ?? null,
          input.professionalId ?? null,
          input.serviceId,
          input.priority,
          startAt,
          endAt,
          input.reason ?? null,
          input.notes ?? null,
          input.source,
          input.originEncounterId ?? null,
          input.allowOverlap,
          ctx.user.id,
        ],
      );

      await this.recordStatus(tx, ctx, appointmentId, null, 'scheduled');

      if (input.originEncounterId) {
        await tx.query(
          `UPDATE clinical.encounters SET follow_up_appointment_id = $3
            WHERE id = $1 AND tenant_id = $2`,
          [input.originEncounterId, ctx.tenantId, appointmentId],
        );
      }

      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'appointment.create',
        entitySchema: 'scheduling',
        entityTable: 'appointments',
        entityId: appointmentId,
        facilityId,
        after: { serviceId: input.serviceId, startAt: startAt.toISOString() },
      });
      await this.audit.publish(tx, ctx, {
        aggregateTable: 'scheduling.appointments',
        aggregateId: appointmentId,
        eventType: 'appointment.scheduled',
        payload: { patientId: input.patientId ?? null },
      });

      return appointmentId;
    });

    return this.get(ctx, id);
  }

  async update(ctx: RequestContext, id: string, input: Record<string, unknown>): Promise<Appointment> {
    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const current = await tx.query<{ status: string; row_version: number; facility_id: string }>(
        `SELECT status, row_version, facility_id FROM scheduling.appointments
          WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [id, ctx.tenantId],
      );
      const appointment = current.rows[0];
      if (!appointment) throw AppError.notFound('Agendamento');
      if (['completed', 'cancelled', 'rescheduled'].includes(appointment.status)) {
        throw AppError.conflict('Este agendamento não pode mais ser alterado.');
      }
      if (input.expectedVersion !== undefined && input.expectedVersion !== appointment.row_version) {
        throw AppError.conflict('O agendamento foi alterado por outra pessoa. Recarregue a página.', {
          currentVersion: appointment.row_version,
        });
      }

      await tx.query(
        `UPDATE scheduling.appointments
            SET professional_id = COALESCE($3, professional_id),
                service_id = COALESCE($4, service_id),
                start_at = COALESCE($5, start_at),
                end_at = COALESCE($6, end_at),
                priority = COALESCE($7, priority),
                reason = COALESCE($8, reason),
                notes = COALESCE($9, notes),
                patient_id = COALESCE($10, patient_id),
                allow_overlap = COALESCE($11, allow_overlap),
                row_version = row_version + 1,
                updated_by = $12
          WHERE id = $1 AND tenant_id = $2`,
        [
          id,
          ctx.tenantId,
          input.professionalId ?? null,
          input.serviceId ?? null,
          input.startAt ?? null,
          input.endAt ?? null,
          input.priority ?? null,
          input.reason ?? null,
          input.notes ?? null,
          input.patientId ?? null,
          input.allowOverlap ?? null,
          ctx.user.id,
        ],
      );

      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'appointment.update',
        entitySchema: 'scheduling',
        entityTable: 'appointments',
        entityId: id,
        after: { fields: Object.keys(input) },
      });
    });

    return this.get(ctx, id);
  }

  async transition(
    ctx: RequestContext,
    id: string,
    to: AppointmentStatus,
    options: { reason?: string } = {},
  ): Promise<Appointment> {
    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const current = await tx.query<{ status: string }>(
        `SELECT status FROM scheduling.appointments WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [id, ctx.tenantId],
      );
      const row = current.rows[0];
      if (!row) throw AppError.notFound('Agendamento');

      assertAppointmentTransition(row.status as AppointmentStatus, to);

      await tx.query(
        `UPDATE scheduling.appointments
            SET status = $3,
                confirmed_at = CASE WHEN $3 = 'confirmed' THEN now() ELSE confirmed_at END,
                cancelled_at = CASE WHEN $3 IN ('cancelled','no_show') THEN now() ELSE cancelled_at END,
                cancel_reason = CASE WHEN $3 IN ('cancelled','no_show') THEN $4 ELSE cancel_reason END,
                row_version = row_version + 1,
                updated_by = $5
          WHERE id = $1 AND tenant_id = $2`,
        [id, ctx.tenantId, to, options.reason ?? null, ctx.user.id],
      );

      await this.recordStatus(tx, ctx, id, row.status, to, options.reason);

      await this.audit.record(tx, ctx, {
        category: to === 'cancelled' ? 'cancel' : 'mutation',
        action: `appointment.${to}`,
        entitySchema: 'scheduling',
        entityTable: 'appointments',
        entityId: id,
        reason: options.reason ?? null,
      });

      if (to === 'cancelled' || to === 'no_show') {
        await this.audit.publish(tx, ctx, {
          aggregateTable: 'scheduling.appointments',
          aggregateId: id,
          eventType: to === 'cancelled' ? 'appointment.cancelled' : 'appointment.no_show',
        });
      }
    });

    return this.get(ctx, id);
  }

  /**
   * Check-in da recepção: muda o agendamento e **cria o atendimento** em
   * `arrived` na mesma transação, com peso opcional aferido na balança.
   */
  async checkIn(ctx: RequestContext, id: string, input: CheckIn): Promise<{ appointment: Appointment; encounterId: string }> {
    const encounterId = await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const current = await tx.query<{
        status: string;
        patient_id: string | null;
        professional_id: string | null;
        service_id: string;
        facility_id: string;
        encounter_id: string | null;
        service_category: string;
      }>(
        `SELECT a.status, a.patient_id, a.professional_id, a.service_id, a.facility_id, a.encounter_id,
                sc.category AS service_category
           FROM scheduling.appointments a
           JOIN registry.service_catalog sc ON sc.id = a.service_id AND sc.tenant_id = a.tenant_id
          WHERE a.id = $1 AND a.tenant_id = $2 FOR UPDATE`,
        [id, ctx.tenantId],
      );
      const appointment = current.rows[0];
      if (!appointment) throw AppError.notFound('Agendamento');
      if (appointment.encounter_id) return appointment.encounter_id;
      if (!appointment.patient_id) {
        throw AppError.validation('Cadastre o paciente antes de fazer o check-in.');
      }

      assertAppointmentTransition(appointment.status as AppointmentStatus, 'checked_in');

      const newEncounterId = uuidv7();
      const numberResult = await tx.query<{ next_number: string }>(
        `SELECT platform.next_number($1, 'encounter') AS next_number`,
        [ctx.tenantId],
      );

      const encounterClass =
        input.encounterClass ??
        (appointment.service_category === 'surgery'
          ? 'surgery'
          : appointment.service_category === 'telehealth'
            ? 'telehealth'
            : 'outpatient');

      await tx.query(
        `INSERT INTO clinical.encounters
           (id, tenant_id, facility_id, number, patient_id, appointment_id, service_id, class, status,
            attending_professional_id, arrived_at, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'arrived',$9, now(), $10, $10)`,
        [
          newEncounterId,
          ctx.tenantId,
          appointment.facility_id,
          numberResult.rows[0]?.next_number ?? '1',
          appointment.patient_id,
          id,
          appointment.service_id,
          encounterClass,
          appointment.professional_id,
          ctx.user.id,
        ],
      );

      await tx.query(
        `UPDATE scheduling.appointments
            SET status = 'checked_in', checked_in_at = now(), encounter_id = $3,
                row_version = row_version + 1, updated_by = $4
          WHERE id = $1 AND tenant_id = $2`,
        [id, ctx.tenantId, newEncounterId, ctx.user.id],
      );

      await this.recordStatus(tx, ctx, id, appointment.status, 'checked_in');

      if (input.weightKg) {
        const result = await this.patients.recordWeightInTx(
          tx,
          ctx,
          appointment.patient_id,
          input.weightKg,
          input.weightUom,
          newEncounterId,
        );
        await tx.query(`UPDATE clinical.encounters SET weight_kg = $3 WHERE id = $1 AND tenant_id = $2`, [
          newEncounterId,
          ctx.tenantId,
          result.weightKg,
        ]);
      }

      if (input.notes) {
        await tx.query(
          `INSERT INTO clinical.encounter_notes
             (id, tenant_id, encounter_id, patient_id, kind, body, author_professional_id, author_user_id, status)
           VALUES ($1,$2,$3,$4,'triage',$5,$6,$7,'draft')`,
          [uuidv7(), ctx.tenantId, newEncounterId, appointment.patient_id, input.notes, ctx.professionalId, ctx.user.id],
        );
      }

      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'appointment.check_in',
        entitySchema: 'scheduling',
        entityTable: 'appointments',
        entityId: id,
        after: { encounterId: newEncounterId },
      });
      await this.audit.publish(tx, ctx, {
        aggregateTable: 'clinical.encounters',
        aggregateId: newEncounterId,
        eventType: 'encounter.created',
        payload: { patientId: appointment.patient_id, appointmentId: id },
      });

      return newEncounterId;
    });

    return { appointment: await this.get(ctx, id), encounterId };
  }

  /** Retornos indicados na finalização e ainda sem agendamento. */
  async listFollowUps(ctx: RequestContext, params: { dueUntil?: string; limit: number }) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query(
        `SELECT e.id AS "encounterId", e.patient_id AS "patientId", p.name AS "patientName",
                g.name AS "guardianName", g.phone_primary AS "guardianPhone",
                e.follow_up_due_at::text AS "dueAt", e.follow_up_reason AS reason,
                e.finished_at AS "finishedAt", pr.name AS "professionalName",
                e.follow_up_appointment_id AS "appointmentId"
           FROM clinical.encounters e
           JOIN registry.patients p ON p.id = e.patient_id AND p.tenant_id = e.tenant_id
           LEFT JOIN LATERAL (
             SELECT gu.name, gu.phone_primary FROM registry.patient_guardians pg
               JOIN registry.guardians gu ON gu.id = pg.guardian_id AND gu.tenant_id = pg.tenant_id
              WHERE pg.patient_id = p.id AND pg.tenant_id = p.tenant_id AND pg.valid_to IS NULL
              ORDER BY pg.is_primary DESC LIMIT 1
           ) g ON true
           LEFT JOIN registry.professionals pr ON pr.id = e.attending_professional_id AND pr.tenant_id = e.tenant_id
          WHERE e.tenant_id = $1
            AND e.follow_up_due_at IS NOT NULL
            AND e.follow_up_appointment_id IS NULL
            AND p.status = 'active'
            AND ($2::date IS NULL OR e.follow_up_due_at <= $2)
          ORDER BY e.follow_up_due_at
          LIMIT $3`,
        [ctx.tenantId, params.dueUntil ?? null, params.limit],
      );
      return { items: rows };
    });
  }

  private async recordStatus(
    tx: PoolClient,
    ctx: RequestContext,
    appointmentId: string,
    from: string | null,
    to: string,
    reason?: string,
  ): Promise<void> {
    await tx.query(
      `INSERT INTO scheduling.appointment_status_history
         (id, tenant_id, appointment_id, from_status, to_status, changed_by, reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [uuidv7(), ctx.tenantId, appointmentId, from, to, ctx.user.id, reason ?? null],
    );
  }

  private assertFacilityAllowed(ctx: RequestContext, facilityId: string): void {
    const scope = facilityScope(ctx);
    if (scope && !scope.includes(facilityId)) {
      throw AppError.forbidden('Unidade fora do seu escopo de acesso.');
    }
  }
}
