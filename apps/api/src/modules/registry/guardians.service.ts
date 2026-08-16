import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { CreateGuardian, Guardian } from '@chiron/contracts';
import { DatabaseService } from '../../database/database.service';
import { AuditService } from '../../common/audit.service';
import { CryptoService } from '../../common/crypto.service';
import { AppError } from '../../common/errors';
import { uuidv7 } from '../../common/uuid';
import type { RequestContext } from '../../common/request-context';
import { contextToTenantContext } from '../../common/request-context';

interface GuardianRow {
  id: string;
  number: string;
  person_type: string;
  name: string;
  legal_name: string | null;
  document_kind: string;
  document_masked: string | null;
  email: string | null;
  phone_primary: string | null;
  phone_secondary: string | null;
  birth_date: Date | null;
  address: Record<string, unknown> | null;
  notes: string | null;
  tags: string[];
  created_at: Date;
  updated_at: Date;
  patient_count?: string;
}

@Injectable()
export class GuardiansService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly crypto: CryptoService,
  ) {}

  private toDto(row: GuardianRow): Guardian {
    return {
      id: row.id,
      number: Number(row.number),
      personType: row.person_type as Guardian['personType'],
      name: row.name,
      legalName: row.legal_name,
      documentKind: row.document_kind as Guardian['documentKind'],
      documentMasked: row.document_masked,
      email: row.email,
      phonePrimary: row.phone_primary,
      phoneSecondary: row.phone_secondary,
      birthDate: row.birth_date ? row.birth_date.toISOString().slice(0, 10) : null,
      address: (row.address as Guardian['address']) ?? null,
      notes: row.notes,
      tags: row.tags ?? [],
      patientCount: row.patient_count ? Number(row.patient_count) : undefined,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async list(ctx: RequestContext, params: { q?: string; limit: number; cursor?: string }) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query<GuardianRow>(
        `SELECT g.*, (SELECT count(*) FROM registry.patient_guardians pg
                       WHERE pg.tenant_id = g.tenant_id AND pg.guardian_id = g.id AND pg.valid_to IS NULL)::text AS patient_count
           FROM registry.guardians g
          WHERE g.tenant_id = $1 AND g.deleted_at IS NULL
            AND ($2::text IS NULL OR g.name ILIKE '%' || $2 || '%' OR g.phone_primary ILIKE '%' || $2 || '%'
                 OR g.email::text ILIKE '%' || $2 || '%')
            AND ($3::timestamptz IS NULL OR g.created_at < $3)
          ORDER BY g.created_at DESC
          LIMIT $4`,
        [ctx.tenantId, params.q ?? null, params.cursor ?? null, params.limit + 1],
      );

      const hasMore = rows.length > params.limit;
      const items = (hasMore ? rows.slice(0, params.limit) : rows).map((r) => this.toDto(r));
      const last = hasMore ? rows[params.limit - 1] : undefined;
      return { items, nextCursor: last ? last.created_at.toISOString() : null };
    });
  }

  async get(ctx: RequestContext, id: string): Promise<Guardian & { patients: unknown[] }> {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query<GuardianRow>(
        `SELECT * FROM registry.guardians WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [id, ctx.tenantId],
      );
      const row = rows[0];
      if (!row) throw AppError.notFound('Tutor');

      const patients = await tx.query(
        `SELECT p.id, p.name, s.name_pt AS "speciesName", pg.role, pg.is_primary AS "isPrimary", p.status
           FROM registry.patient_guardians pg
           JOIN registry.patients p ON p.id = pg.patient_id AND p.tenant_id = pg.tenant_id
           JOIN registry.species s ON s.id = p.species_id
          WHERE pg.guardian_id = $1 AND pg.tenant_id = $2 AND pg.valid_to IS NULL AND p.deleted_at IS NULL
          ORDER BY p.name`,
        [id, ctx.tenantId],
      );

      return { ...this.toDto(row), patients: patients.rows };
    });
  }

  /** Criação usada tanto pela rota quanto pelo cadastro rápido de paciente. */
  async createInTx(tx: PoolClient, ctx: RequestContext, input: CreateGuardian): Promise<string> {
    const id = uuidv7();
    const numberResult = await tx.query<{ next_number: string }>(
      `SELECT platform.next_number($1, 'guardian') AS next_number`,
      [ctx.tenantId],
    );
    const number = numberResult.rows[0]?.next_number ?? '1';

    const documentHash = input.document ? this.crypto.blindIndex(input.document) : null;
    if (documentHash) {
      const existing = await tx.query<{ id: string; name: string }>(
        `SELECT id, name FROM registry.guardians
          WHERE tenant_id = $1 AND document_hash = $2 AND deleted_at IS NULL`,
        [ctx.tenantId, documentHash],
      );
      if (existing.rows[0]) {
        throw AppError.conflict(`Já existe um tutor com este documento: ${existing.rows[0].name}.`, {
          guardianId: existing.rows[0].id,
        });
      }
    }

    await tx.query(
      `INSERT INTO registry.guardians
         (id, tenant_id, number, person_type, name, legal_name, document_kind, document_encrypted,
          document_hash, document_masked, email, phone_primary, phone_secondary, birth_date, address,
          notes, tags, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$18)`,
      [
        id,
        ctx.tenantId,
        number,
        input.personType,
        input.name,
        input.legalName ?? null,
        input.documentKind,
        input.document ? this.crypto.encrypt(input.document) : null,
        documentHash,
        input.document ? this.crypto.mask(input.document) : null,
        input.email ?? null,
        input.phonePrimary ?? null,
        input.phoneSecondary ?? null,
        input.birthDate ?? null,
        input.address ? JSON.stringify(input.address) : null,
        input.notes ?? null,
        input.tags ?? [],
        ctx.user.id,
      ],
    );

    await this.audit.record(tx, ctx, {
      category: 'mutation',
      action: 'guardian.create',
      entitySchema: 'registry',
      entityTable: 'guardians',
      entityId: id,
      after: { number, personType: input.personType },
    });

    return id;
  }

  async create(ctx: RequestContext, input: CreateGuardian): Promise<Guardian> {
    const id = await this.db.withTenant(contextToTenantContext(ctx), (tx) => this.createInTx(tx, ctx, input));
    const created = await this.get(ctx, id);
    return created;
  }

  async update(ctx: RequestContext, id: string, input: Partial<CreateGuardian>): Promise<Guardian> {
    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const before = await tx.query<GuardianRow>(
        `SELECT * FROM registry.guardians WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [id, ctx.tenantId],
      );
      if (!before.rows[0]) throw AppError.notFound('Tutor');

      const documentHash = input.document ? this.crypto.blindIndex(input.document) : undefined;

      await tx.query(
        `UPDATE registry.guardians
            SET person_type = COALESCE($3, person_type),
                name = COALESCE($4, name),
                legal_name = COALESCE($5, legal_name),
                document_kind = COALESCE($6, document_kind),
                document_encrypted = COALESCE($7, document_encrypted),
                document_hash = COALESCE($8, document_hash),
                document_masked = COALESCE($9, document_masked),
                email = COALESCE($10, email),
                phone_primary = COALESCE($11, phone_primary),
                phone_secondary = COALESCE($12, phone_secondary),
                birth_date = COALESCE($13, birth_date),
                address = COALESCE($14, address),
                notes = COALESCE($15, notes),
                tags = COALESCE($16, tags),
                updated_by = $17
          WHERE id = $1 AND tenant_id = $2`,
        [
          id,
          ctx.tenantId,
          input.personType ?? null,
          input.name ?? null,
          input.legalName ?? null,
          input.documentKind ?? null,
          input.document ? this.crypto.encrypt(input.document) : null,
          documentHash ?? null,
          input.document ? this.crypto.mask(input.document) : null,
          input.email ?? null,
          input.phonePrimary ?? null,
          input.phoneSecondary ?? null,
          input.birthDate ?? null,
          input.address ? JSON.stringify(input.address) : null,
          input.notes ?? null,
          input.tags ?? null,
          ctx.user.id,
        ],
      );

      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'guardian.update',
        entitySchema: 'registry',
        entityTable: 'guardians',
        entityId: id,
        after: { fields: Object.keys(input) },
      });
    });

    return this.get(ctx, id);
  }

  async softDelete(ctx: RequestContext, id: string): Promise<void> {
    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const linked = await tx.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM registry.patient_guardians
          WHERE guardian_id = $1 AND tenant_id = $2 AND valid_to IS NULL`,
        [id, ctx.tenantId],
      );
      if (Number(linked.rows[0]?.count ?? '0') > 0) {
        throw AppError.conflict('Este tutor ainda está vinculado a pacientes. Desvincule antes de inativar.');
      }
      const { rowCount } = await tx.query(
        `UPDATE registry.guardians SET deleted_at = now(), updated_by = $3
          WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [id, ctx.tenantId, ctx.user.id],
      );
      if (!rowCount) throw AppError.notFound('Tutor');

      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'guardian.delete',
        entitySchema: 'registry',
        entityTable: 'guardians',
        entityId: id,
      });
    });
  }

  /** Exportação LGPD: dados do titular e dos pacientes vinculados. */
  async exportData(ctx: RequestContext, id: string) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const guardian = await tx.query<GuardianRow & { document_encrypted: string | null }>(
        `SELECT * FROM registry.guardians WHERE id = $1 AND tenant_id = $2`,
        [id, ctx.tenantId],
      );
      const row = guardian.rows[0];
      if (!row) throw AppError.notFound('Tutor');

      const patients = await tx.query(
        `SELECT p.id, p.name, p.birth_date, p.status, s.name_pt AS species
           FROM registry.patient_guardians pg
           JOIN registry.patients p ON p.id = pg.patient_id AND p.tenant_id = pg.tenant_id
           JOIN registry.species s ON s.id = p.species_id
          WHERE pg.guardian_id = $1 AND pg.tenant_id = $2`,
        [id, ctx.tenantId],
      );

      const consents = await tx.query(
        `SELECT kind, text_version, granted_at, revoked_at, method FROM documents.consents
          WHERE guardian_id = $1 AND tenant_id = $2`,
        [id, ctx.tenantId],
      );

      await this.audit.recordAccess(tx, ctx, { resource: 'export', resourceId: id, purpose: 'lgpd_export' });
      await this.audit.record(tx, ctx, {
        category: 'export',
        action: 'guardian.export',
        entitySchema: 'registry',
        entityTable: 'guardians',
        entityId: id,
      });

      return {
        guardian: {
          ...this.toDto(row),
          document: this.crypto.decrypt(row.document_encrypted),
        },
        patients: patients.rows,
        consents: consents.rows,
        exportedAt: new Date().toISOString(),
      };
    });
  }

  /**
   * Anonimização LGPD: remove dado pessoal do tutor preservando o vínculo e o
   * prontuário do animal (obrigação de guarda).
   */
  async anonymize(ctx: RequestContext, id: string): Promise<void> {
    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rowCount } = await tx.query(
        `UPDATE registry.guardians
            SET name = 'Titular anonimizado',
                legal_name = NULL,
                document_encrypted = NULL,
                document_hash = NULL,
                document_masked = NULL,
                email = NULL,
                phone_primary = NULL,
                phone_secondary = NULL,
                birth_date = NULL,
                address = NULL,
                notes = NULL,
                tags = '{}',
                updated_by = $3,
                deleted_at = now()
          WHERE id = $1 AND tenant_id = $2`,
        [id, ctx.tenantId, ctx.user.id],
      );
      if (!rowCount) throw AppError.notFound('Tutor');

      await tx.query(
        `UPDATE documents.communication_preferences SET allowed = false WHERE guardian_id = $1 AND tenant_id = $2`,
        [id, ctx.tenantId],
      );

      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'guardian.anonymize',
        entitySchema: 'registry',
        entityTable: 'guardians',
        entityId: id,
        reason: 'Solicitação do titular (LGPD)',
      });
    });
  }
}
