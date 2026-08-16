import { Injectable } from '@nestjs/common';
import type { Dashboard } from '@chiron/contracts';
import { DatabaseService } from '../../database/database.service';
import { AppError } from '../../common/errors';
import type { RequestContext } from '../../common/request-context';
import { contextToTenantContext, facilityScope } from '../../common/request-context';

/**
 * Painel operacional do dia. Cada número aqui tem uma origem única no banco
 * e um destino clicável: nada de métrica decorativa. Tudo respeita o escopo
 * de unidades do usuário e a timezone da unidade.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly db: DatabaseService) {}

  async load(ctx: RequestContext, params: { facilityId?: string; date?: string }): Promise<Dashboard> {
    const facilityId = params.facilityId ?? ctx.facilityId;
    const scope = facilityScope(ctx);
    if (facilityId && scope && !scope.includes(facilityId)) {
      throw AppError.forbidden('Você não tem acesso a esta unidade.');
    }

    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const tzResult = await tx.query<{ timezone: string }>(
        `SELECT timezone FROM platform.facilities
          WHERE tenant_id = $1 AND ($2::uuid IS NULL OR id = $2) AND deleted_at IS NULL
          ORDER BY is_default DESC LIMIT 1`,
        [ctx.tenantId, facilityId ?? null],
      );
      const timezone = tzResult.rows[0]?.timezone ?? 'America/Sao_Paulo';

      const dayResult = await tx.query<{ day: string; day_start: Date; day_end: Date }>(
        `WITH d AS (
           SELECT COALESCE($1::date, (now() AT TIME ZONE $2::text)::date) AS day
         )
         SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
                (d.day::timestamp AT TIME ZONE $2::text) AS day_start,
                ((d.day + 1)::timestamp AT TIME ZONE $2::text) AS day_end
           FROM d`,
        [params.date ?? null, timezone],
      );
      const day = dayResult.rows[0];
      if (!day) throw AppError.validation('Data inválida.');

      const args = [ctx.tenantId, day.day_start, day.day_end, facilityId ?? null, scope];

      const agenda = await tx.query<{
        id: string;
        start_at: Date;
        end_at: Date;
        patient_name: string | null;
        patient_id: string | null;
        guardian_name: string | null;
        service_name: string;
        professional_name: string | null;
        status: string;
        encounter_id: string | null;
      }>(
        `SELECT a.id, a.start_at, a.end_at, p.name AS patient_name, a.patient_id,
                g.name AS guardian_name, sc.name AS service_name, pr.name AS professional_name,
                a.status, a.encounter_id
           FROM scheduling.appointments a
           JOIN registry.service_catalog sc ON sc.id = a.service_id AND sc.tenant_id = a.tenant_id
           LEFT JOIN registry.patients p ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
           LEFT JOIN registry.guardians g ON g.id = a.guardian_id AND g.tenant_id = a.tenant_id
           LEFT JOIN registry.professionals pr ON pr.id = a.professional_id AND pr.tenant_id = a.tenant_id
          WHERE a.tenant_id = $1 AND a.start_at >= $2 AND a.start_at < $3
            AND ($4::uuid IS NULL OR a.facility_id = $4)
            AND ($5::uuid[] IS NULL OR a.facility_id = ANY($5))
            AND a.status <> 'rescheduled'
          ORDER BY a.start_at
          LIMIT 200`,
        args,
      );

      const openEncounters = await tx.query<{
        id: string;
        patient_id: string;
        patient_name: string;
        status: string;
        started_at: Date | null;
        arrived_at: Date | null;
        professional_name: string | null;
      }>(
        `SELECT e.id, e.patient_id, p.name AS patient_name, e.status, e.started_at, e.arrived_at,
                pr.name AS professional_name
           FROM clinical.encounters e
           JOIN registry.patients p ON p.id = e.patient_id AND p.tenant_id = e.tenant_id
           LEFT JOIN registry.professionals pr
             ON pr.id = e.attending_professional_id AND pr.tenant_id = e.tenant_id
          WHERE e.tenant_id = $1 AND e.status IN ('arrived', 'triaged', 'in_progress', 'on_hold')
            AND ($2::uuid IS NULL OR e.facility_id = $2)
            AND ($3::uuid[] IS NULL OR e.facility_id = ANY($3))
          ORDER BY COALESCE(e.arrived_at, e.created_at)
          LIMIT 100`,
        [ctx.tenantId, facilityId ?? null, scope],
      );

      const metricsResult = await tx.query<{
        appointments_today: string;
        waiting: string;
        in_progress: string;
        finished_today: string;
        pending_exams: string;
        follow_ups_due: string;
        immunizations_due: string;
        active_patients: string;
      }>(
        `SELECT
           (SELECT count(*) FROM scheduling.appointments a
             WHERE a.tenant_id = $1 AND a.start_at >= $2 AND a.start_at < $3
               AND ($4::uuid IS NULL OR a.facility_id = $4)
               AND ($5::uuid[] IS NULL OR a.facility_id = ANY($5))
               AND a.status NOT IN ('cancelled', 'rescheduled'))::text AS appointments_today,
           (SELECT count(*) FROM clinical.encounters e
             WHERE e.tenant_id = $1 AND e.status IN ('arrived', 'triaged')
               AND ($4::uuid IS NULL OR e.facility_id = $4)
               AND ($5::uuid[] IS NULL OR e.facility_id = ANY($5)))::text AS waiting,
           (SELECT count(*) FROM clinical.encounters e
             WHERE e.tenant_id = $1 AND e.status IN ('in_progress', 'on_hold')
               AND ($4::uuid IS NULL OR e.facility_id = $4)
               AND ($5::uuid[] IS NULL OR e.facility_id = ANY($5)))::text AS in_progress,
           (SELECT count(*) FROM clinical.encounters e
             WHERE e.tenant_id = $1 AND e.status = 'finished'
               AND e.ended_at >= $2 AND e.ended_at < $3
               AND ($4::uuid IS NULL OR e.facility_id = $4)
               AND ($5::uuid[] IS NULL OR e.facility_id = ANY($5)))::text AS finished_today,
           (SELECT count(*) FROM lab.exam_orders o
             WHERE o.tenant_id = $1 AND o.status IN ('ordered', 'partially_resulted', 'resulted')
               AND ($4::uuid IS NULL OR o.facility_id = $4)
               AND ($5::uuid[] IS NULL OR o.facility_id = ANY($5)))::text AS pending_exams,
           (SELECT count(*) FROM clinical.encounters e
              JOIN registry.patients p ON p.id = e.patient_id AND p.tenant_id = e.tenant_id
             WHERE e.tenant_id = $1 AND e.follow_up_due_at IS NOT NULL
               AND e.follow_up_due_at <= ($3::date + 7)
               AND e.follow_up_appointment_id IS NULL
               AND p.status = 'active' AND p.deleted_at IS NULL
               AND ($4::uuid IS NULL OR e.facility_id = $4)
               AND ($5::uuid[] IS NULL OR e.facility_id = ANY($5)))::text AS follow_ups_due,
           (SELECT count(*) FROM immunization.immunizations i
              JOIN registry.patients p ON p.id = i.patient_id AND p.tenant_id = i.tenant_id
             WHERE i.tenant_id = $1 AND i.status = 'completed' AND i.next_due_at IS NOT NULL
               AND i.next_due_at <= ($3::date + 30)
               AND p.status = 'active' AND p.deleted_at IS NULL
               AND NOT EXISTS (
                 SELECT 1 FROM immunization.immunizations later
                  WHERE later.tenant_id = i.tenant_id AND later.patient_id = i.patient_id
                    AND later.vaccine_name = i.vaccine_name AND later.status = 'completed'
                    AND later.administered_at > i.administered_at))::text AS immunizations_due,
           (SELECT count(*) FROM registry.patients p
             WHERE p.tenant_id = $1 AND p.status = 'active' AND p.deleted_at IS NULL)::text AS active_patients`,
        args,
      );
      const m = metricsResult.rows[0];

      const unsignedResult = await tx.query<{ count: string }>(
        `SELECT count(*)::text AS count
           FROM clinical.encounter_notes n
          WHERE n.tenant_id = $1 AND n.status = 'draft'
            AND n.created_at < now() - INTERVAL '1 day'`,
        [ctx.tenantId],
      );

      const recent = await tx.query<{
        id: string;
        name: string;
        species_name: string;
        last_encounter_at: Date | null;
        guardian_name: string | null;
      }>(
        `SELECT p.id, p.name, s.name_pt AS species_name, le.last_encounter_at, g.name AS guardian_name
           FROM registry.patients p
           JOIN registry.species s ON s.id = p.species_id
           LEFT JOIN LATERAL (
             SELECT max(COALESCE(e.ended_at, e.started_at, e.arrived_at, e.created_at)) AS last_encounter_at
               FROM clinical.encounters e
              WHERE e.patient_id = p.id AND e.tenant_id = p.tenant_id AND e.status <> 'entered_in_error'
           ) le ON true
           LEFT JOIN LATERAL (
             SELECT gu.name FROM registry.patient_guardians pg
               JOIN registry.guardians gu ON gu.id = pg.guardian_id AND gu.tenant_id = pg.tenant_id
              WHERE pg.patient_id = p.id AND pg.tenant_id = p.tenant_id AND pg.valid_to IS NULL
              ORDER BY pg.is_primary DESC LIMIT 1
           ) g ON true
          WHERE p.tenant_id = $1 AND p.deleted_at IS NULL AND le.last_encounter_at IS NOT NULL
          ORDER BY le.last_encounter_at DESC
          LIMIT 8`,
        [ctx.tenantId],
      );

      const metrics = {
        appointmentsToday: Number(m?.appointments_today ?? 0),
        waiting: Number(m?.waiting ?? 0),
        inProgress: Number(m?.in_progress ?? 0),
        finishedToday: Number(m?.finished_today ?? 0),
        pendingExams: Number(m?.pending_exams ?? 0),
        followUpsDue: Number(m?.follow_ups_due ?? 0),
        immunizationsDue: Number(m?.immunizations_due ?? 0),
        activePatients: Number(m?.active_patients ?? 0),
      };

      const alerts: Dashboard['alerts'] = [];
      if (metrics.pendingExams > 0) {
        alerts.push({
          kind: 'pending_exams',
          label: 'Exames aguardando resultado',
          count: metrics.pendingExams,
          href: '/exames?pendentes=1',
        });
      }
      if (metrics.followUpsDue > 0) {
        alerts.push({
          kind: 'follow_ups',
          label: 'Retornos a agendar',
          count: metrics.followUpsDue,
          href: '/agenda?retornos=1',
        });
      }
      if (metrics.immunizationsDue > 0) {
        alerts.push({
          kind: 'immunizations',
          label: 'Vacinas vencendo em 30 dias',
          count: metrics.immunizationsDue,
          href: '/vacinas?pendentes=1',
        });
      }
      const unsigned = Number(unsignedResult.rows[0]?.count ?? 0);
      if (unsigned > 0) {
        alerts.push({
          kind: 'unsigned_encounters',
          label: 'Notas em rascunho há mais de um dia',
          count: unsigned,
          href: '/atendimentos?rascunhos=1',
        });
      }

      return {
        date: day.day,
        metrics,
        agenda: agenda.rows.map((r) => ({
          id: r.id,
          startAt: r.start_at.toISOString(),
          endAt: r.end_at.toISOString(),
          patientName: r.patient_name,
          patientId: r.patient_id,
          guardianName: r.guardian_name,
          serviceName: r.service_name,
          professionalName: r.professional_name,
          status: r.status as Dashboard['agenda'][number]['status'],
          encounterId: r.encounter_id,
        })),
        openEncounters: openEncounters.rows.map((r) => ({
          id: r.id,
          patientId: r.patient_id,
          patientName: r.patient_name,
          status: r.status as Dashboard['openEncounters'][number]['status'],
          startedAt: r.started_at?.toISOString() ?? null,
          arrivedAt: r.arrived_at?.toISOString() ?? null,
          professionalName: r.professional_name,
        })),
        alerts,
        recentPatients: recent.rows.map((r) => ({
          id: r.id,
          name: r.name,
          speciesName: r.species_name,
          lastEncounterAt: r.last_encounter_at?.toISOString() ?? null,
          guardianName: r.guardian_name,
        })),
      };
    });
  }
}
