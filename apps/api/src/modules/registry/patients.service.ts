import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { ageLabel, normalizeIngredient, normalizeObservation, toKilograms } from '@chiron/domain';
import type { CreatePatient, Patient, PatientListItem, RecordDeath } from '@chiron/contracts';
import { DatabaseService } from '../../database/database.service';
import { AuditService } from '../../common/audit.service';
import { AppError } from '../../common/errors';
import { uuidv7 } from '../../common/uuid';
import type { RequestContext } from '../../common/request-context';
import { contextToTenantContext } from '../../common/request-context';
import { GuardiansService } from './guardians.service';

@Injectable()
export class PatientsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly guardians: GuardiansService,
  ) {}

  async list(
    ctx: RequestContext,
    params: { q?: string; speciesId?: string; status?: string; guardianId?: string; limit: number; cursor?: string },
  ): Promise<{ items: PatientListItem[]; nextCursor: string | null }> {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query<{
        id: string;
        number: string;
        name: string;
        species_name: string;
        species_category: string;
        breed_name: string | null;
        sex: string;
        birth_date: Date | null;
        estimated_age_months: number | null;
        current_weight_kg: string | null;
        status: string;
        guardian_name: string | null;
        guardian_phone: string | null;
        alert_count: string;
        last_encounter_at: Date | null;
        created_at: Date;
      }>(
        `SELECT p.id, p.number::text, p.name, s.name_pt AS species_name, s.category AS species_category,
                b.name AS breed_name, p.sex, p.birth_date, p.estimated_age_months,
                p.current_weight_kg::text, p.status,
                g.name AS guardian_name, g.phone_primary AS guardian_phone,
                (SELECT count(*) FROM registry.patient_alerts pa
                  WHERE pa.patient_id = p.id AND pa.tenant_id = p.tenant_id AND pa.active)::text AS alert_count,
                (SELECT max(e.created_at) FROM clinical.encounters e
                  WHERE e.patient_id = p.id AND e.tenant_id = p.tenant_id) AS last_encounter_at,
                p.created_at
           FROM registry.patients p
           JOIN registry.species s ON s.id = p.species_id
           LEFT JOIN registry.breeds b ON b.id = p.breed_id
           LEFT JOIN LATERAL (
             SELECT gu.name, gu.phone_primary
               FROM registry.patient_guardians pg
               JOIN registry.guardians gu ON gu.id = pg.guardian_id AND gu.tenant_id = pg.tenant_id
              WHERE pg.patient_id = p.id AND pg.tenant_id = p.tenant_id AND pg.valid_to IS NULL
              ORDER BY pg.is_primary DESC LIMIT 1
           ) g ON true
          WHERE p.tenant_id = $1 AND p.deleted_at IS NULL
            AND ($2::text IS NULL OR p.name ILIKE '%' || $2 || '%' OR g.name ILIKE '%' || $2 || '%'
                 OR EXISTS (SELECT 1 FROM registry.patient_identifiers pi
                             WHERE pi.patient_id = p.id AND pi.tenant_id = p.tenant_id AND pi.value ILIKE '%' || $2 || '%'))
            AND ($3::uuid IS NULL OR p.species_id = $3)
            AND ($4::text IS NULL OR p.status = $4)
            AND ($5::uuid IS NULL OR EXISTS (
                  SELECT 1 FROM registry.patient_guardians pg2
                   WHERE pg2.patient_id = p.id AND pg2.tenant_id = p.tenant_id AND pg2.guardian_id = $5))
            AND ($6::timestamptz IS NULL OR p.created_at < $6)
          ORDER BY p.created_at DESC
          LIMIT $7`,
        [
          ctx.tenantId,
          params.q ?? null,
          params.speciesId ?? null,
          params.status ?? null,
          params.guardianId ?? null,
          params.cursor ?? null,
          params.limit + 1,
        ],
      );

      const hasMore = rows.length > params.limit;
      const page = hasMore ? rows.slice(0, params.limit) : rows;

      const items: PatientListItem[] = page.map((r) => ({
        id: r.id,
        number: Number(r.number),
        name: r.name,
        speciesName: r.species_name,
        speciesCategory: r.species_category as PatientListItem['speciesCategory'],
        breedName: r.breed_name,
        sex: r.sex as PatientListItem['sex'],
        ageLabel: ageLabel(r.birth_date, r.estimated_age_months),
        currentWeightKg: r.current_weight_kg,
        status: r.status as PatientListItem['status'],
        primaryGuardianName: r.guardian_name,
        primaryGuardianPhone: r.guardian_phone,
        alertCount: Number(r.alert_count),
        lastEncounterAt: r.last_encounter_at?.toISOString() ?? null,
      }));

      const last = hasMore ? page[page.length - 1] : undefined;
      return { items, nextCursor: last ? last.created_at.toISOString() : null };
    });
  }

  async get(ctx: RequestContext, id: string): Promise<Patient> {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => this.loadPatient(tx, ctx, id));
  }

  private async loadPatient(tx: PoolClient, ctx: RequestContext, id: string): Promise<Patient> {
    const { rows } = await tx.query<Record<string, never> & {
      id: string;
      number: string;
      name: string;
      species_id: string;
      species_code: string;
      species_name: string;
      species_category: string;
      species_weight_uom: string;
      breed_id: string | null;
      breed_name: string | null;
      breed_free_text: string | null;
      sex: string;
      reproductive_status: string;
      birth_date: Date | null;
      birth_date_precision: string | null;
      estimated_age_months: number | null;
      color_markings: string | null;
      current_weight_kg: string | null;
      current_weight_at: Date | null;
      status: string;
      no_known_allergies: boolean;
      attributes: Record<string, unknown>;
      notes: string | null;
      internal_code: string | null;
      deceased_at: Date | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT p.id, p.number::text, p.name, p.species_id, s.code AS species_code, s.name_pt AS species_name,
              s.category AS species_category, s.default_weight_uom AS species_weight_uom,
              p.breed_id, b.name AS breed_name, p.breed_free_text, p.sex, p.reproductive_status,
              p.birth_date, p.birth_date_precision, p.estimated_age_months, p.color_markings,
              p.current_weight_kg::text, p.current_weight_at, p.status, p.no_known_allergies,
              p.attributes, p.notes, p.internal_code, p.created_at, p.updated_at,
              (SELECT d.occurred_at FROM clinical.patient_deaths d
                WHERE d.patient_id = p.id AND d.tenant_id = p.tenant_id) AS deceased_at
         FROM registry.patients p
         JOIN registry.species s ON s.id = p.species_id
         LEFT JOIN registry.breeds b ON b.id = p.breed_id
        WHERE p.id = $1 AND p.tenant_id = $2 AND p.deleted_at IS NULL`,
      [id, ctx.tenantId],
    );
    const row = rows[0];
    if (!row) throw AppError.notFound('Paciente');

    const [guardians, identifiers, allergies, alerts] = await Promise.all([
      tx.query(
        `SELECT pg.guardian_id AS "guardianId", g.name AS "guardianName", g.phone_primary AS "guardianPhone",
                g.email::text AS "guardianEmail", pg.role, pg.is_primary AS "isPrimary"
           FROM registry.patient_guardians pg
           JOIN registry.guardians g ON g.id = pg.guardian_id AND g.tenant_id = pg.tenant_id
          WHERE pg.patient_id = $1 AND pg.tenant_id = $2 AND pg.valid_to IS NULL
          ORDER BY pg.is_primary DESC, g.name`,
        [id, ctx.tenantId],
      ),
      tx.query(
        `SELECT id, scheme, value, issuer FROM registry.patient_identifiers
          WHERE patient_id = $1 AND tenant_id = $2 ORDER BY scheme`,
        [id, ctx.tenantId],
      ),
      tx.query(
        `SELECT id, substance, reaction, severity, status, noted_at AS "notedAt"
           FROM registry.patient_allergies
          WHERE patient_id = $1 AND tenant_id = $2 AND status = 'active'
          ORDER BY noted_at DESC`,
        [id, ctx.tenantId],
      ),
      tx.query(
        `SELECT id, kind, message, active FROM registry.patient_alerts
          WHERE patient_id = $1 AND tenant_id = $2 AND active ORDER BY created_at DESC`,
        [id, ctx.tenantId],
      ),
    ]);

    return {
      id: row.id,
      number: Number(row.number),
      name: row.name,
      species: {
        id: row.species_id,
        code: row.species_code,
        namePt: row.species_name,
        category: row.species_category as Patient['species']['category'],
        defaultWeightUom: row.species_weight_uom as Patient['species']['defaultWeightUom'],
      },
      breed: row.breed_id && row.breed_name ? { id: row.breed_id, name: row.breed_name } : null,
      breedFreeText: row.breed_free_text,
      sex: row.sex as Patient['sex'],
      reproductiveStatus: row.reproductive_status as Patient['reproductiveStatus'],
      birthDate: row.birth_date ? row.birth_date.toISOString().slice(0, 10) : null,
      birthDatePrecision: (row.birth_date_precision as Patient['birthDatePrecision']) ?? null,
      estimatedAgeMonths: row.estimated_age_months,
      ageLabel: ageLabel(row.birth_date, row.estimated_age_months),
      colorMarkings: row.color_markings,
      currentWeightKg: row.current_weight_kg,
      currentWeightAt: row.current_weight_at?.toISOString() ?? null,
      status: row.status as Patient['status'],
      noKnownAllergies: row.no_known_allergies,
      attributes: row.attributes ?? {},
      notes: row.notes,
      internalCode: row.internal_code,
      guardians: guardians.rows as Patient['guardians'],
      identifiers: identifiers.rows as Patient['identifiers'],
      allergies: (allergies.rows as Array<{ notedAt: Date }>).map((a) => ({
        ...(a as unknown as Patient['allergies'][number]),
        notedAt: a.notedAt.toISOString(),
      })),
      alerts: alerts.rows as Patient['alerts'],
      deceasedAt: row.deceased_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async create(ctx: RequestContext, input: CreatePatient): Promise<Patient> {
    const id = await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const patientId = uuidv7();
      const numberResult = await tx.query<{ next_number: string }>(
        `SELECT platform.next_number($1, 'patient') AS next_number`,
        [ctx.tenantId],
      );

      const species = await tx.query<{ id: string; requires_scientific_name: boolean; default_weight_uom: string }>(
        `SELECT id, requires_scientific_name, default_weight_uom FROM registry.species
          WHERE id = $1 AND (tenant_id IS NULL OR tenant_id = $2) AND active`,
        [input.speciesId, ctx.tenantId],
      );
      if (!species.rows[0]) throw AppError.validation('Espécie inválida.');

      if (species.rows[0].requires_scientific_name && !input.attributes?.['nameScientific']) {
        throw AppError.validation('Para espécies silvestres, informe o nome científico nos atributos.');
      }

      await tx.query(
        `INSERT INTO registry.patients
           (id, tenant_id, number, name, species_id, breed_id, breed_free_text, sex, reproductive_status,
            birth_date, birth_date_precision, estimated_age_months, color_markings, attributes, notes,
            internal_code, origin_facility_id, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$18)`,
        [
          patientId,
          ctx.tenantId,
          numberResult.rows[0]?.next_number ?? '1',
          input.name,
          input.speciesId,
          input.breedId ?? null,
          input.breedFreeText ?? null,
          input.sex,
          input.reproductiveStatus,
          input.birthDate ?? null,
          input.birthDatePrecision ?? (input.birthDate ? 'exact' : null),
          input.estimatedAgeMonths ?? null,
          input.colorMarkings ?? null,
          JSON.stringify(input.attributes ?? {}),
          input.notes ?? null,
          input.internalCode ?? null,
          ctx.facilityId,
          ctx.user.id,
        ],
      );

      // Cadastro rápido: tutor criado junto com o paciente, na mesma transação.
      const guardianLinks = [...(input.guardians ?? [])];
      if (input.newGuardian) {
        const guardianId = await this.guardians.createInTx(tx, ctx, input.newGuardian);
        guardianLinks.unshift({ guardianId, role: 'owner', isPrimary: true });
      }

      let hasPrimary = false;
      for (const link of guardianLinks) {
        const isPrimary = link.isPrimary && !hasPrimary;
        if (isPrimary) hasPrimary = true;
        await tx.query(
          `INSERT INTO registry.patient_guardians (tenant_id, patient_id, guardian_id, role, is_primary)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (tenant_id, patient_id, guardian_id, role) DO NOTHING`,
          [ctx.tenantId, patientId, link.guardianId, link.role, isPrimary],
        );
      }
      if (guardianLinks.length > 0 && !hasPrimary) {
        const first = guardianLinks[0];
        if (first) {
          await tx.query(
            `UPDATE registry.patient_guardians SET is_primary = true
              WHERE tenant_id = $1 AND patient_id = $2 AND guardian_id = $3`,
            [ctx.tenantId, patientId, first.guardianId],
          );
        }
      }

      if (guardianLinks.length === 0) {
        await tx.query(
          `INSERT INTO registry.patient_alerts (id, tenant_id, patient_id, kind, message, created_by)
           VALUES ($1,$2,$3,'no_guardian','Paciente sem tutor identificado',$4)`,
          [uuidv7(), ctx.tenantId, patientId, ctx.user.id],
        );
      }

      for (const identifier of input.identifiers ?? []) {
        await tx.query(
          `INSERT INTO registry.patient_identifiers (id, tenant_id, patient_id, scheme, value, issuer)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [uuidv7(), ctx.tenantId, patientId, identifier.scheme, identifier.value, identifier.issuer ?? null],
        );
      }

      if (input.weightKg) {
        await this.recordWeightInTx(tx, ctx, patientId, input.weightKg, 'kg');
      }

      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'patient.create',
        entitySchema: 'registry',
        entityTable: 'patients',
        entityId: patientId,
        after: { speciesId: input.speciesId, guardians: guardianLinks.length },
      });
      await this.audit.publish(tx, ctx, {
        aggregateTable: 'registry.patients',
        aggregateId: patientId,
        eventType: 'patient.created',
      });

      return patientId;
    });

    return this.get(ctx, id);
  }

  async update(ctx: RequestContext, id: string, input: Record<string, unknown>): Promise<Patient> {
    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rowCount } = await tx.query(
        `UPDATE registry.patients
            SET name = COALESCE($3, name),
                species_id = COALESCE($4, species_id),
                breed_id = COALESCE($5, breed_id),
                breed_free_text = COALESCE($6, breed_free_text),
                sex = COALESCE($7, sex),
                reproductive_status = COALESCE($8, reproductive_status),
                birth_date = COALESCE($9, birth_date),
                birth_date_precision = COALESCE($10, birth_date_precision),
                estimated_age_months = COALESCE($11, estimated_age_months),
                color_markings = COALESCE($12, color_markings),
                attributes = COALESCE($13, attributes),
                notes = COALESCE($14, notes),
                internal_code = COALESCE($15, internal_code),
                status = COALESCE($16, status),
                no_known_allergies = COALESCE($17, no_known_allergies),
                no_known_allergies_at = CASE WHEN $17::boolean IS TRUE THEN now() ELSE no_known_allergies_at END,
                no_known_allergies_by = CASE WHEN $17::boolean IS TRUE THEN $18 ELSE no_known_allergies_by END,
                row_version = row_version + 1,
                updated_by = $18
          WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [
          id,
          ctx.tenantId,
          input.name ?? null,
          input.speciesId ?? null,
          input.breedId ?? null,
          input.breedFreeText ?? null,
          input.sex ?? null,
          input.reproductiveStatus ?? null,
          input.birthDate ?? null,
          input.birthDatePrecision ?? null,
          input.estimatedAgeMonths ?? null,
          input.colorMarkings ?? null,
          input.attributes ? JSON.stringify(input.attributes) : null,
          input.notes ?? null,
          input.internalCode ?? null,
          input.status ?? null,
          input.noKnownAllergies ?? null,
          ctx.user.id,
        ],
      );
      if (!rowCount) throw AppError.notFound('Paciente');

      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'patient.update',
        entitySchema: 'registry',
        entityTable: 'patients',
        entityId: id,
        after: { fields: Object.keys(input) },
      });
    });

    return this.get(ctx, id);
  }

  async softDelete(ctx: RequestContext, id: string): Promise<void> {
    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const signed = await tx.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM clinical.encounters
          WHERE patient_id = $1 AND tenant_id = $2 AND status = 'finished'`,
        [id, ctx.tenantId],
      );
      if (Number(signed.rows[0]?.count ?? '0') > 0) {
        // Prontuário assinado tem guarda obrigatória: inativa em vez de excluir.
        await tx.query(
          `UPDATE registry.patients SET status = 'inactive', updated_by = $3 WHERE id = $1 AND tenant_id = $2`,
          [id, ctx.tenantId, ctx.user.id],
        );
      } else {
        const { rowCount } = await tx.query(
          `UPDATE registry.patients SET deleted_at = now(), status = 'inactive', updated_by = $3
            WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
          [id, ctx.tenantId, ctx.user.id],
        );
        if (!rowCount) throw AppError.notFound('Paciente');
      }

      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'patient.delete',
        entitySchema: 'registry',
        entityTable: 'patients',
        entityId: id,
      });
    });
  }

  async addGuardian(
    ctx: RequestContext,
    patientId: string,
    input: { guardianId: string; role: string; isPrimary: boolean },
  ): Promise<void> {
    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      if (input.isPrimary) {
        await tx.query(
          `UPDATE registry.patient_guardians SET is_primary = false
            WHERE tenant_id = $1 AND patient_id = $2 AND valid_to IS NULL`,
          [ctx.tenantId, patientId],
        );
      }
      await tx.query(
        `INSERT INTO registry.patient_guardians (tenant_id, patient_id, guardian_id, role, is_primary)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (tenant_id, patient_id, guardian_id, role)
         DO UPDATE SET is_primary = EXCLUDED.is_primary, valid_to = NULL`,
        [ctx.tenantId, patientId, input.guardianId, input.role, input.isPrimary],
      );
      await tx.query(
        `UPDATE registry.patient_alerts SET active = false
          WHERE tenant_id = $1 AND patient_id = $2 AND kind = 'no_guardian' AND active`,
        [ctx.tenantId, patientId],
      );
      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'patient.add_guardian',
        entitySchema: 'registry',
        entityTable: 'patient_guardians',
        entityId: patientId,
        after: { guardianId: input.guardianId, role: input.role },
      });
    });
  }

  async removeGuardian(ctx: RequestContext, patientId: string, guardianId: string): Promise<void> {
    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      await tx.query(
        `UPDATE registry.patient_guardians SET valid_to = CURRENT_DATE
          WHERE tenant_id = $1 AND patient_id = $2 AND guardian_id = $3 AND valid_to IS NULL`,
        [ctx.tenantId, patientId, guardianId],
      );
      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'patient.remove_guardian',
        entitySchema: 'registry',
        entityTable: 'patient_guardians',
        entityId: patientId,
        after: { guardianId },
      });
    });
  }

  async addIdentifier(ctx: RequestContext, patientId: string, input: { scheme: string; value: string; issuer?: string }) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const id = uuidv7();
      const { rows } = await tx.query(
        `INSERT INTO registry.patient_identifiers (id, tenant_id, patient_id, scheme, value, issuer)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, scheme, value, issuer`,
        [id, ctx.tenantId, patientId, input.scheme, input.value, input.issuer ?? null],
      );
      return rows[0];
    });
  }

  async addAllergy(
    ctx: RequestContext,
    patientId: string,
    input: { substance: string; reaction?: string; severity: string },
  ) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const id = uuidv7();
      const { rows } = await tx.query(
        `INSERT INTO registry.patient_allergies
           (id, tenant_id, patient_id, substance, active_ingredient_normalized, reaction, severity, noted_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id, substance, reaction, severity, status, noted_at AS "notedAt"`,
        [
          id,
          ctx.tenantId,
          patientId,
          input.substance,
          normalizeIngredient(input.substance),
          input.reaction ?? null,
          input.severity,
          ctx.user.id,
        ],
      );
      // registrar alergia invalida a marcação de "sem alergias conhecidas"
      await tx.query(
        `UPDATE registry.patients SET no_known_allergies = false WHERE id = $1 AND tenant_id = $2`,
        [patientId, ctx.tenantId],
      );
      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'patient.add_allergy',
        entitySchema: 'registry',
        entityTable: 'patient_allergies',
        entityId: id,
      });
      await this.audit.publish(tx, ctx, {
        aggregateTable: 'registry.patient_allergies',
        aggregateId: id,
        eventType: 'allergy.added',
        payload: { patientId },
      });
      return rows[0];
    });
  }

  async addAlert(ctx: RequestContext, patientId: string, input: { kind: string; message: string }) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const id = uuidv7();
      const { rows } = await tx.query(
        `INSERT INTO registry.patient_alerts (id, tenant_id, patient_id, kind, message, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, kind, message, active`,
        [id, ctx.tenantId, patientId, input.kind, input.message, ctx.user.id],
      );
      return rows[0];
    });
  }

  /** Pesagem, com ou sem atendimento (recepção pesa na entrada). */
  async recordWeightInTx(
    tx: PoolClient,
    ctx: RequestContext,
    patientId: string,
    value: number,
    uom: 'kg' | 'g',
    encounterId?: string | null,
  ): Promise<{ id: string; weightKg: number }> {
    const normalized = normalizeObservation({ code: 'weight', value, uom });
    const weightKg = normalized.valueNumeric ?? toKilograms(value, uom);
    const id = uuidv7();

    await tx.query(
      `INSERT INTO clinical.observations
         (id, tenant_id, patient_id, encounter_id, code, value_numeric, uom, entered_value, entered_uom,
          measured_at, measured_by_professional_id, measured_by_user_id)
       VALUES ($1,$2,$3,$4,'weight',$5,'kg',$6,$7, now(), $8, $9)`,
      [
        id,
        ctx.tenantId,
        patientId,
        encounterId ?? null,
        weightKg,
        normalized.enteredValue,
        normalized.enteredUom,
        ctx.professionalId,
        ctx.user.id,
      ],
    );

    await tx.query(
      `UPDATE registry.patients SET current_weight_kg = $3, current_weight_at = now()
        WHERE id = $1 AND tenant_id = $2`,
      [patientId, ctx.tenantId, weightKg],
    );

    await this.audit.publish(tx, ctx, {
      aggregateTable: 'clinical.observations',
      aggregateId: id,
      eventType: 'weight.recorded',
      payload: { patientId, encounterId: encounterId ?? null },
    });

    return { id, weightKg };
  }

  async recordWeight(ctx: RequestContext, patientId: string, value: number, uom: 'kg' | 'g') {
    return this.db.withTenant(contextToTenantContext(ctx), (tx) =>
      this.recordWeightInTx(tx, ctx, patientId, value, uom),
    );
  }

  async listWeights(ctx: RequestContext, patientId: string) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query(
        `SELECT id, measured_at AS "measuredAt", value_numeric::text AS "weightKg",
                entered_value AS "enteredValue", entered_uom AS "enteredUom", encounter_id AS "encounterId"
           FROM clinical.observations
          WHERE tenant_id = $1 AND patient_id = $2 AND code = 'weight' AND status = 'final'
          ORDER BY measured_at DESC
          LIMIT 200`,
        [ctx.tenantId, patientId],
      );
      return rows;
    });
  }

  /** Óbito: fecha agenda futura, suspende lembretes e marca o cadastro. */
  async recordDeath(ctx: RequestContext, patientId: string, input: RecordDeath) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const patient = await tx.query<{ id: string; status: string }>(
        `SELECT id, status FROM registry.patients WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [patientId, ctx.tenantId],
      );
      if (!patient.rows[0]) throw AppError.notFound('Paciente');
      if (patient.rows[0].status === 'deceased') throw AppError.conflict('Óbito já registrado para este paciente.');

      const id = uuidv7();
      await tx.query(
        `INSERT INTO clinical.patient_deaths
           (id, tenant_id, patient_id, encounter_id, occurred_at, kind, cause_text, consent_id,
            body_disposition, notes, recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          id,
          ctx.tenantId,
          patientId,
          input.encounterId ?? null,
          input.occurredAt,
          input.kind,
          input.causeText ?? null,
          input.consentId ?? null,
          input.bodyDisposition,
          input.notes ?? null,
          ctx.user.id,
        ],
      );

      await tx.query(
        `UPDATE registry.patients SET status = 'deceased', updated_by = $3 WHERE id = $1 AND tenant_id = $2`,
        [patientId, ctx.tenantId, ctx.user.id],
      );

      const cancelled = await tx.query(
        `UPDATE scheduling.appointments
            SET status = 'cancelled', cancelled_at = now(), cancel_reason = 'Óbito do paciente'
          WHERE tenant_id = $1 AND patient_id = $2 AND start_at > now()
            AND status IN ('scheduled', 'confirmed')
        RETURNING id`,
        [ctx.tenantId, patientId],
      );

      await tx.query(
        `UPDATE immunization.immunizations SET next_due_at = NULL
          WHERE tenant_id = $1 AND patient_id = $2 AND next_due_at IS NOT NULL`,
        [ctx.tenantId, patientId],
      );
      await tx.query(
        `UPDATE immunization.preventive_treatments SET next_due_at = NULL
          WHERE tenant_id = $1 AND patient_id = $2 AND next_due_at IS NOT NULL`,
        [ctx.tenantId, patientId],
      );

      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'patient.death',
        entitySchema: 'clinical',
        entityTable: 'patient_deaths',
        entityId: id,
        after: { kind: input.kind, cancelledAppointments: cancelled.rowCount },
      });
      await this.audit.publish(tx, ctx, {
        aggregateTable: 'clinical.patient_deaths',
        aggregateId: id,
        eventType: 'patient.deceased',
        payload: { patientId },
      });

      return { id, cancelledAppointments: cancelled.rowCount ?? 0 };
    });
  }

  async getDeath(ctx: RequestContext, patientId: string) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query(
        `SELECT id, occurred_at AS "occurredAt", kind, cause_text AS "causeText",
                body_disposition AS "bodyDisposition", notes, certificate_document_id AS "certificateDocumentId"
           FROM clinical.patient_deaths WHERE patient_id = $1 AND tenant_id = $2`,
        [patientId, ctx.tenantId],
      );
      return rows[0] ?? null;
    });
  }
}
