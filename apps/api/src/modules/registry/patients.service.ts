import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { ageLabel, normalizeIngredient, normalizeObservation, toKilograms } from '@chiron/domain';
import type {
  AddPatientGuardian,
  AddPatientIdentifier,
  CreatePatient,
  InactivatePatient,
  ListPatientsQuery,
  Patient,
  PatientListItem,
  RecordDeath,
  UpdateAllergyStatus,
} from '@chiron/contracts';
import { DatabaseService } from '../../database/database.service';
import { AuditService } from '../../common/audit.service';
import { decodeCursor, encodeCursor } from '../../common/cursor';
import { AppError } from '../../common/errors';
import { uuidv7 } from '../../common/uuid';
import type { RequestContext } from '../../common/request-context';
import { contextToTenantContext } from '../../common/request-context';
import { GuardiansService } from './guardians.service';

const IDENTIFIER_NOUN: Record<string, string> = {
  microchip: 'microchip',
  ear_tag: 'brinco',
  sisbov: 'SISBOV',
  leg_band: 'anilha',
  passport: 'passaporte',
  registry: 'registro',
  tattoo: 'tatuagem',
  license: 'licença',
  internal: 'código interno',
};

/**
 * Leitor e digitação divergem em espaço, ponto e hífen ("985 112 000 123 456"):
 * no microchip só os caracteres contam, senão o mesmo chip entra duas vezes.
 */
function normalizeIdentifierValue(scheme: string, value: string): string {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return scheme === 'microchip' ? trimmed.replace(/[\s.-]/g, '').toUpperCase() : trimmed;
}

@Injectable()
export class PatientsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly guardians: GuardiansService,
  ) {}

  async list(
    ctx: RequestContext,
    params: ListPatientsQuery,
  ): Promise<{ items: PatientListItem[]; nextCursor: string | null }> {
    const cursor = decodeCursor(params.cursor);
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
        cursor_at: string;
      }>(
        `SELECT p.id, p.number::text, p.name, s.name_pt AS species_name, s.category AS species_category,
                b.name AS breed_name, p.sex, p.birth_date, p.estimated_age_months,
                p.current_weight_kg::text, p.status,
                g.name AS guardian_name, g.phone_primary AS guardian_phone,
                (SELECT count(*) FROM registry.patient_alerts pa
                  WHERE pa.patient_id = p.id AND pa.tenant_id = p.tenant_id AND pa.active)::text AS alert_count,
                (SELECT max(e.created_at) FROM clinical.encounters e
                  WHERE e.patient_id = p.id AND e.tenant_id = p.tenant_id) AS last_encounter_at,
                p.created_at::text AS cursor_at
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
                             WHERE pi.patient_id = p.id AND pi.tenant_id = p.tenant_id AND pi.removed_at IS NULL
                               AND pi.value ILIKE '%' || $2 || '%'))
            AND ($3::uuid IS NULL OR p.species_id = $3)
            AND ($4::text[] IS NULL OR p.status = ANY($4))
            AND ($5::uuid IS NULL OR EXISTS (
                  SELECT 1 FROM registry.patient_guardians pg2
                   WHERE pg2.patient_id = p.id AND pg2.tenant_id = p.tenant_id AND pg2.guardian_id = $5
                     AND pg2.valid_to IS NULL))
            AND ($6::timestamptz IS NULL OR p.created_at < $6
                 OR (p.created_at = $6 AND $7::uuid IS NOT NULL AND p.id < $7))
          ORDER BY p.created_at DESC, p.id DESC
          LIMIT $8`,
        [
          ctx.tenantId,
          params.q ?? null,
          params.speciesId ?? null,
          params.status ?? null,
          params.guardianId ?? null,
          cursor?.at ?? null,
          cursor?.id ?? null,
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
      return { items, nextCursor: last ? encodeCursor(last.cursor_at, last.id) : null };
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
      inactive_reason: string | null;
      inactivated_at: Date | null;
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
              p.current_weight_kg::text, p.current_weight_at, p.status, p.inactive_reason, p.inactivated_at,
              p.no_known_allergies, p.attributes, p.notes, p.internal_code, p.created_at, p.updated_at,
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
                g.email::text AS "guardianEmail", pg.role, pg.is_primary AS "isPrimary",
                (g.inactivated_at IS NOT NULL) AS "guardianInactive"
           FROM registry.patient_guardians pg
           JOIN registry.guardians g ON g.id = pg.guardian_id AND g.tenant_id = pg.tenant_id
          WHERE pg.patient_id = $1 AND pg.tenant_id = $2 AND pg.valid_to IS NULL
          ORDER BY pg.is_primary DESC, g.name`,
        [id, ctx.tenantId],
      ),
      tx.query(
        `SELECT id, scheme, value, issuer FROM registry.patient_identifiers
          WHERE patient_id = $1 AND tenant_id = $2 AND removed_at IS NULL ORDER BY scheme, created_at`,
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
      inactiveReason: row.inactive_reason,
      inactivatedAt: row.inactivated_at?.toISOString() ?? null,
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

      for (const link of input.guardians ?? []) {
        await this.assertGuardianLinkable(tx, ctx, link.guardianId);
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
        await this.insertIdentifier(tx, ctx, patientId, identifier);
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
                no_known_allergies = COALESCE($16, no_known_allergies),
                no_known_allergies_at = CASE WHEN $16::boolean IS TRUE THEN now() ELSE no_known_allergies_at END,
                no_known_allergies_by = CASE WHEN $16::boolean IS TRUE THEN $17 ELSE no_known_allergies_by END,
                row_version = row_version + 1,
                updated_by = $17
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
        // Óbito continua óbito: a exclusão não apaga essa situação.
        await tx.query(
          `UPDATE registry.patients
              SET status = 'inactive', updated_by = $3,
                  inactive_reason = 'Exclusão pedida; prontuário mantido por guarda obrigatória',
                  inactivated_at = now(), inactivated_by = $3
            WHERE id = $1 AND tenant_id = $2 AND status = 'active'`,
          [id, ctx.tenantId, ctx.user.id],
        );
      } else {
        const { rowCount } = await tx.query(
          `UPDATE registry.patients SET deleted_at = now(), status = 'inactive', updated_by = $3
            WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
          [id, ctx.tenantId, ctx.user.id],
        );
        if (!rowCount) throw AppError.notFound('Paciente');
        // Cadastro excluído não segura o microchip: o número pode ir para o animal certo.
        await tx.query(
          `UPDATE registry.patient_identifiers SET removed_at = now(), removed_by = $3
            WHERE patient_id = $1 AND tenant_id = $2 AND removed_at IS NULL`,
          [id, ctx.tenantId, ctx.user.id],
        );
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

  /**
   * Paciente em uso nesta organização. Com `lock`, a linha fica presa até o
   * fim da transação: duas recepcionistas desvinculando ao mesmo tempo não
   * conseguem, juntas, deixar o animal sem tutor.
   */
  private async findPatient(
    tx: PoolClient,
    ctx: RequestContext,
    patientId: string,
    lock = false,
  ): Promise<{ id: string; status: string }> {
    const { rows } = await tx.query<{ id: string; status: string }>(
      `SELECT id, status FROM registry.patients
        WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL${lock ? ' FOR UPDATE' : ''}`,
      [patientId, ctx.tenantId],
    );
    const patient = rows[0];
    if (!patient) throw AppError.notFound('Paciente');
    return patient;
  }

  /** Vínculo novo só com tutor que existe e está ativo. */
  private async assertGuardianLinkable(tx: PoolClient, ctx: RequestContext, guardianId: string): Promise<void> {
    const { rows } = await tx.query<{ inactivated_at: Date | null }>(
      `SELECT inactivated_at FROM registry.guardians WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [guardianId, ctx.tenantId],
    );
    const guardian = rows[0];
    if (!guardian) throw AppError.notFound('Tutor');
    if (guardian.inactivated_at) {
      throw AppError.conflict('Este tutor está inativo. Reative o cadastro dele antes de vincular.', { guardianId });
    }
  }

  /**
   * Identificador em uso é único na organização. A mensagem diz em qual
   * animal o número já está, para a recepção decidir se é erro de digitação
   * ou cadastro duplicado.
   */
  private async insertIdentifier(
    tx: PoolClient,
    ctx: RequestContext,
    patientId: string,
    input: AddPatientIdentifier,
  ): Promise<{ id: string; scheme: string; value: string; issuer: string | null }> {
    const value = normalizeIdentifierValue(input.scheme, input.value);
    if (!value) throw AppError.validation('Informe o número do identificador.');

    const taken = await tx.query<{ patient_id: string; name: string; number: string }>(
      `SELECT pi.patient_id, p.name, p.number::text
         FROM registry.patient_identifiers pi
         JOIN registry.patients p ON p.id = pi.patient_id AND p.tenant_id = pi.tenant_id
        WHERE pi.tenant_id = $1 AND pi.scheme = $2 AND pi.value = $3 AND pi.removed_at IS NULL`,
      [ctx.tenantId, input.scheme, value],
    );
    const owner = taken.rows[0];
    if (owner) {
      const noun = IDENTIFIER_NOUN[input.scheme] ?? 'identificador';
      throw AppError.conflict(
        owner.patient_id === patientId
          ? `Este número de ${noun} já está cadastrado neste paciente.`
          : `Este número de ${noun} já está cadastrado no paciente ${owner.name} (nº ${owner.number}).`,
        { patientId: owner.patient_id },
      );
    }

    const id = uuidv7();
    const issuer = input.issuer || null;
    await tx.query(
      `INSERT INTO registry.patient_identifiers (id, tenant_id, patient_id, scheme, value, issuer)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, ctx.tenantId, patientId, input.scheme, value, issuer],
    );
    return { id, scheme: input.scheme, value, issuer };
  }

  /** Vincula tutor cadastrado ou cria um novo na mesma transação (cotutor, troca de tutor). */
  async addGuardian(ctx: RequestContext, patientId: string, input: AddPatientGuardian): Promise<Patient> {
    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      await this.findPatient(tx, ctx, patientId, true);

      let guardianId = input.guardianId;
      if (input.newGuardian) {
        guardianId = await this.guardians.createInTx(tx, ctx, input.newGuardian);
      } else if (guardianId) {
        await this.assertGuardianLinkable(tx, ctx, guardianId);
      }
      if (!guardianId) throw AppError.validation('Escolha um tutor cadastrado ou informe os dados de um novo.');

      const links = await tx.query<{ guardian_id: string; is_primary: boolean }>(
        `SELECT guardian_id, is_primary FROM registry.patient_guardians
          WHERE tenant_id = $1 AND patient_id = $2 AND valid_to IS NULL`,
        [ctx.tenantId, patientId],
      );
      if (links.rows.some((link) => link.guardian_id === guardianId)) {
        throw AppError.conflict('Este tutor já está vinculado ao paciente.');
      }

      // Sem principal ainda, o primeiro vínculo assume: a ficha sempre tem um contato de referência.
      const isPrimary = input.isPrimary || !links.rows.some((link) => link.is_primary);
      if (isPrimary) {
        await tx.query(
          `UPDATE registry.patient_guardians SET is_primary = false
            WHERE tenant_id = $1 AND patient_id = $2 AND valid_to IS NULL AND is_primary`,
          [ctx.tenantId, patientId],
        );
      }
      // Vínculo encerrado com o mesmo papel volta a valer a partir de hoje; o
      // período anterior fica na auditoria.
      await tx.query(
        `INSERT INTO registry.patient_guardians (tenant_id, patient_id, guardian_id, role, is_primary)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (tenant_id, patient_id, guardian_id, role)
         DO UPDATE SET is_primary = EXCLUDED.is_primary, valid_from = CURRENT_DATE, valid_to = NULL`,
        [ctx.tenantId, patientId, guardianId, input.role, isPrimary],
      );
      await tx.query(
        `UPDATE registry.patient_alerts SET active = false, deactivated_at = now(), deactivated_by = $3
          WHERE tenant_id = $1 AND patient_id = $2 AND kind = 'no_guardian' AND active`,
        [ctx.tenantId, patientId, ctx.user.id],
      );
      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'patient.add_guardian',
        entitySchema: 'registry',
        entityTable: 'patient_guardians',
        entityId: patientId,
        after: { guardianId, role: input.role, isPrimary, newGuardian: Boolean(input.newGuardian) },
      });
    });
    return this.get(ctx, patientId);
  }

  /** Encerra o vínculo (valid_to), nunca apaga. O último tutor não sai. */
  async removeGuardian(ctx: RequestContext, patientId: string, guardianId: string): Promise<Patient> {
    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      await this.findPatient(tx, ctx, patientId, true);

      const links = await tx.query<{ guardian_id: string; role: string; is_primary: boolean }>(
        `SELECT guardian_id, role, is_primary FROM registry.patient_guardians
          WHERE tenant_id = $1 AND patient_id = $2 AND valid_to IS NULL
          ORDER BY (role = 'owner') DESC, valid_from, created_at`,
        [ctx.tenantId, patientId],
      );
      const removed = links.rows.filter((link) => link.guardian_id === guardianId);
      if (removed.length === 0) throw AppError.notFound('Vínculo com o tutor');

      const remaining = links.rows.filter((link) => link.guardian_id !== guardianId);
      const successor = remaining[0];
      if (!successor) {
        throw AppError.conflict(
          'O paciente precisa de pelo menos um tutor. Vincule o novo tutor antes de desvincular este.',
        );
      }

      await tx.query(
        `UPDATE registry.patient_guardians SET valid_to = CURRENT_DATE
          WHERE tenant_id = $1 AND patient_id = $2 AND guardian_id = $3 AND valid_to IS NULL`,
        [ctx.tenantId, patientId, guardianId],
      );

      // Saiu o principal: o próximo tutor (dono primeiro, depois o mais antigo) assume.
      const promoted = removed.some((link) => link.is_primary) && !remaining.some((link) => link.is_primary);
      if (promoted) {
        await tx.query(
          `UPDATE registry.patient_guardians SET is_primary = true
            WHERE tenant_id = $1 AND patient_id = $2 AND guardian_id = $3 AND role = $4 AND valid_to IS NULL`,
          [ctx.tenantId, patientId, successor.guardian_id, successor.role],
        );
      }

      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'patient.remove_guardian',
        entitySchema: 'registry',
        entityTable: 'patient_guardians',
        entityId: patientId,
        before: { guardianId, roles: removed.map((link) => link.role) },
        after: { primaryGuardianId: promoted ? successor.guardian_id : undefined },
      });
    });
    return this.get(ctx, patientId);
  }

  async setPrimaryGuardian(ctx: RequestContext, patientId: string, guardianId: string): Promise<Patient> {
    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      await this.findPatient(tx, ctx, patientId, true);

      const { rows } = await tx.query<{ role: string; is_primary: boolean; inactivated_at: Date | null }>(
        `SELECT pg.role, pg.is_primary, g.inactivated_at
           FROM registry.patient_guardians pg
           JOIN registry.guardians g ON g.id = pg.guardian_id AND g.tenant_id = pg.tenant_id
          WHERE pg.tenant_id = $1 AND pg.patient_id = $2 AND pg.guardian_id = $3 AND pg.valid_to IS NULL
          ORDER BY pg.is_primary DESC, (pg.role = 'owner') DESC
          LIMIT 1`,
        [ctx.tenantId, patientId, guardianId],
      );
      const link = rows[0];
      if (!link) throw AppError.notFound('Vínculo com o tutor');
      if (link.is_primary) return;
      if (link.inactivated_at) {
        throw AppError.conflict('Tutor inativo não pode ser o principal. Reative o cadastro dele antes.');
      }

      await tx.query(
        `UPDATE registry.patient_guardians SET is_primary = false
          WHERE tenant_id = $1 AND patient_id = $2 AND valid_to IS NULL AND is_primary`,
        [ctx.tenantId, patientId],
      );
      await tx.query(
        `UPDATE registry.patient_guardians SET is_primary = true
          WHERE tenant_id = $1 AND patient_id = $2 AND guardian_id = $3 AND role = $4 AND valid_to IS NULL`,
        [ctx.tenantId, patientId, guardianId, link.role],
      );
      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'patient.set_primary_guardian',
        entitySchema: 'registry',
        entityTable: 'patient_guardians',
        entityId: patientId,
        after: { guardianId },
      });
    });
    return this.get(ctx, patientId);
  }

  async addIdentifier(ctx: RequestContext, patientId: string, input: AddPatientIdentifier) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      await this.findPatient(tx, ctx, patientId);
      const identifier = await this.insertIdentifier(tx, ctx, patientId, input);
      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'patient.add_identifier',
        entitySchema: 'registry',
        entityTable: 'patient_identifiers',
        entityId: identifier.id,
        after: { patientId, scheme: identifier.scheme },
      });
      return identifier;
    });
  }

  /** Remoção lógica: o número sai da ficha e da busca, a linha fica para a auditoria. */
  async removeIdentifier(ctx: RequestContext, patientId: string, identifierId: string): Promise<void> {
    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query<{ scheme: string }>(
        `UPDATE registry.patient_identifiers SET removed_at = now(), removed_by = $4
          WHERE id = $1 AND patient_id = $2 AND tenant_id = $3 AND removed_at IS NULL
        RETURNING scheme`,
        [identifierId, patientId, ctx.tenantId, ctx.user.id],
      );
      if (!rows[0]) throw AppError.notFound('Identificador');
      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'patient.remove_identifier',
        entitySchema: 'registry',
        entityTable: 'patient_identifiers',
        entityId: identifierId,
        before: { patientId, scheme: rows[0].scheme },
      });
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

  /** Alertas de manejo ("agressivo", "morde"): ficam no topo da ficha até alguém desativar. */
  async addAlert(ctx: RequestContext, patientId: string, input: { kind: string; message: string }) {
    if (input.kind === 'no_guardian') {
      throw AppError.validation('Este alerta é do sistema: aparece sozinho quando o paciente fica sem tutor.');
    }
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      await this.findPatient(tx, ctx, patientId);
      const id = uuidv7();
      const { rows } = await tx.query(
        `INSERT INTO registry.patient_alerts (id, tenant_id, patient_id, kind, message, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, kind, message, active`,
        [id, ctx.tenantId, patientId, input.kind, input.message, ctx.user.id],
      );
      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'patient.add_alert',
        entitySchema: 'registry',
        entityTable: 'patient_alerts',
        entityId: id,
        after: { patientId, kind: input.kind },
      });
      return rows[0];
    });
  }

  async deactivateAlert(ctx: RequestContext, patientId: string, alertId: string): Promise<void> {
    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query<{ kind: string }>(
        `SELECT kind FROM registry.patient_alerts
          WHERE id = $1 AND patient_id = $2 AND tenant_id = $3 AND active FOR UPDATE`,
        [alertId, patientId, ctx.tenantId],
      );
      const alert = rows[0];
      if (!alert) throw AppError.notFound('Alerta');
      if (alert.kind === 'no_guardian') {
        throw AppError.conflict('Este alerta sai sozinho quando um tutor é vinculado ao paciente.');
      }
      await tx.query(
        `UPDATE registry.patient_alerts SET active = false, deactivated_at = now(), deactivated_by = $3
          WHERE id = $1 AND tenant_id = $2`,
        [alertId, ctx.tenantId, ctx.user.id],
      );
      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'patient.deactivate_alert',
        entitySchema: 'registry',
        entityTable: 'patient_alerts',
        entityId: alertId,
        before: { patientId, kind: alert.kind },
      });
    });
  }

  /**
   * Alergia não se apaga: sai da lista ativa como inativa (não se aplica
   * mais) ou refutada (não era alergia). A receita deixa de alertar sobre ela.
   */
  async updateAllergyStatus(ctx: RequestContext, patientId: string, allergyId: string, input: UpdateAllergyStatus) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query<{
        id: string;
        substance: string;
        reaction: string | null;
        severity: string;
        status: string;
        notedAt: Date;
      }>(
        `UPDATE registry.patient_allergies SET status = $4
          WHERE id = $1 AND patient_id = $2 AND tenant_id = $3 AND status = 'active'
        RETURNING id, substance, reaction, severity, status, noted_at AS "notedAt"`,
        [allergyId, patientId, ctx.tenantId, input.status],
      );
      const allergy = rows[0];
      if (!allergy) throw AppError.notFound('Registro de alergia');

      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'patient.update_allergy_status',
        entitySchema: 'registry',
        entityTable: 'patient_allergies',
        entityId: allergyId,
        before: { patientId, status: 'active' },
        after: { status: input.status },
        reason: input.reason || null,
      });
      await this.audit.publish(tx, ctx, {
        aggregateTable: 'registry.patient_allergies',
        aggregateId: allergyId,
        eventType: 'allergy.status_changed',
        payload: { patientId, status: input.status },
      });
      return { ...allergy, notedAt: allergy.notedAt.toISOString() };
    });
  }

  /** Deixou de ser cliente ou foi transferido: sai dos seletores, continua na busca e no prontuário. */
  async inactivate(ctx: RequestContext, patientId: string, input: InactivatePatient): Promise<Patient> {
    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const patient = await this.findPatient(tx, ctx, patientId, true);
      if (patient.status === 'deceased') {
        throw AppError.conflict('Paciente com óbito registrado não é inativado: o óbito já tira o cadastro de uso.');
      }
      if (patient.status !== 'active') throw AppError.conflict('O cadastro deste paciente já está inativo.');

      const status = input.transferred ? 'transferred' : 'inactive';
      await tx.query(
        `UPDATE registry.patients
            SET status = $3, inactive_reason = $4, inactivated_at = now(), inactivated_by = $5,
                updated_by = $5, row_version = row_version + 1
          WHERE id = $1 AND tenant_id = $2`,
        [patientId, ctx.tenantId, status, input.reason, ctx.user.id],
      );
      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'patient.inactivate',
        entitySchema: 'registry',
        entityTable: 'patients',
        entityId: patientId,
        before: { status: patient.status },
        after: { status },
        reason: input.reason,
      });
      await this.audit.publish(tx, ctx, {
        aggregateTable: 'registry.patients',
        aggregateId: patientId,
        eventType: 'patient.inactivated',
        payload: { status },
      });
    });
    return this.get(ctx, patientId);
  }

  async reactivate(ctx: RequestContext, patientId: string): Promise<Patient> {
    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const patient = await this.findPatient(tx, ctx, patientId, true);
      if (patient.status === 'deceased') {
        throw AppError.conflict('Paciente com óbito registrado não pode ser reativado.');
      }
      if (patient.status === 'active') throw AppError.conflict('O cadastro deste paciente já está ativo.');

      await tx.query(
        `UPDATE registry.patients
            SET status = 'active', inactive_reason = NULL, inactivated_at = NULL, inactivated_by = NULL,
                updated_by = $3, row_version = row_version + 1
          WHERE id = $1 AND tenant_id = $2`,
        [patientId, ctx.tenantId, ctx.user.id],
      );
      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'patient.reactivate',
        entitySchema: 'registry',
        entityTable: 'patients',
        entityId: patientId,
        before: { status: patient.status },
        after: { status: 'active' },
      });
      await this.audit.publish(tx, ctx, {
        aggregateTable: 'registry.patients',
        aggregateId: patientId,
        eventType: 'patient.reactivated',
      });
    });
    return this.get(ctx, patientId);
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
