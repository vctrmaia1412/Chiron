import { Injectable } from '@nestjs/common';
import { parseIdentifier } from '@chiron/domain';
import type { SearchResult } from '@chiron/contracts';
import { DatabaseService } from '../../database/database.service';
import { CryptoService } from '../../common/crypto.service';
import { AuditService } from '../../common/audit.service';
import type { RequestContext } from '../../common/request-context';
import { contextToTenantContext, facilityScope } from '../../common/request-context';

export interface ScanTarget {
  kind: 'patient' | 'guardian' | 'unknown';
  id?: string;
  label?: string;
  href?: string;
  parsed: ReturnType<typeof parseIdentifier>;
}

/**
 * Busca global: um único campo resolve paciente, tutor, agendamento e
 * atendimento. Documentos (CPF/CNPJ) são procurados pelo índice cego
 * (HMAC), nunca por comparação em texto claro.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly db: DatabaseService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  async search(ctx: RequestContext, term: string, limit: number): Promise<{ items: SearchResult[] }> {
    const query = term.trim();
    if (query.length < 2) return { items: [] };

    const digits = query.replace(/\D/g, '');
    const documentHash = digits.length === 11 || digits.length === 14 ? this.crypto.blindIndex(digits) : null;
    const numeric = /^\d+$/.test(query) ? Number(query) : null;

    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const scope = facilityScope(ctx);
      const like = `%${query}%`;
      const items: SearchResult[] = [];

      if (ctx.permissions.has('patient:read')) {
        const patients = await tx.query<{
          id: string;
          name: string;
          number: string;
          species_name: string;
          guardian_name: string | null;
        }>(
          `SELECT p.id, p.name, p.number::text AS number, s.name_pt AS species_name, g.name AS guardian_name
             FROM registry.patients p
             JOIN registry.species s ON s.id = p.species_id
             LEFT JOIN LATERAL (
               SELECT gu.name FROM registry.patient_guardians pg
                 JOIN registry.guardians gu ON gu.id = pg.guardian_id AND gu.tenant_id = pg.tenant_id
                WHERE pg.patient_id = p.id AND pg.tenant_id = p.tenant_id AND pg.valid_to IS NULL
                ORDER BY pg.is_primary DESC LIMIT 1
             ) g ON true
            WHERE p.tenant_id = $1 AND p.deleted_at IS NULL
              AND (
                p.name ILIKE $2
                OR ($3::bigint IS NOT NULL AND p.number = $3)
                OR p.internal_code ILIKE $2
                OR EXISTS (
                  SELECT 1 FROM registry.patient_identifiers pi
                   WHERE pi.patient_id = p.id AND pi.tenant_id = p.tenant_id AND pi.value ILIKE $2)
              )
            ORDER BY (p.name ILIKE $4) DESC, p.name
            LIMIT $5`,
          [ctx.tenantId, like, numeric, `${query}%`, limit],
        );
        for (const row of patients.rows) {
          items.push({
            type: 'patient',
            id: row.id,
            title: row.name,
            subtitle: [`#${row.number}`, row.species_name, row.guardian_name].filter(Boolean).join(' · '),
            href: `/pacientes/${row.id}`,
          });
        }
      }

      if (ctx.permissions.has('guardian:read')) {
        const guardians = await tx.query<{
          id: string;
          name: string;
          number: string;
          phone_primary: string | null;
          document_masked: string | null;
        }>(
          `SELECT id, name, number::text AS number, phone_primary, document_masked
             FROM registry.guardians
            WHERE tenant_id = $1 AND deleted_at IS NULL
              AND (
                name ILIKE $2
                OR phone_primary ILIKE $2
                OR email::text ILIKE $2
                OR ($3::bigint IS NOT NULL AND number = $3)
                OR ($4::text IS NOT NULL AND document_hash = $4)
              )
            ORDER BY (name ILIKE $5) DESC, name
            LIMIT $6`,
          [ctx.tenantId, like, numeric, documentHash, `${query}%`, limit],
        );
        for (const row of guardians.rows) {
          items.push({
            type: 'guardian',
            id: row.id,
            title: row.name,
            subtitle: [`#${row.number}`, row.phone_primary, row.document_masked].filter(Boolean).join(' · '),
            href: `/tutores/${row.id}`,
          });
        }
      }

      if (ctx.permissions.has('appointment:read')) {
        const appointments = await tx.query<{
          id: string;
          start_at: Date;
          patient_name: string | null;
          guardian_name: string | null;
          service_name: string;
          status: string;
        }>(
          `SELECT a.id, a.start_at, p.name AS patient_name, g.name AS guardian_name,
                  sc.name AS service_name, a.status
             FROM scheduling.appointments a
             JOIN registry.service_catalog sc ON sc.id = a.service_id AND sc.tenant_id = a.tenant_id
             LEFT JOIN registry.patients p ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
             LEFT JOIN registry.guardians g ON g.id = a.guardian_id AND g.tenant_id = a.tenant_id
            WHERE a.tenant_id = $1
              AND ($2::uuid[] IS NULL OR a.facility_id = ANY($2))
              AND (p.name ILIKE $3 OR g.name ILIKE $3 OR ($4::bigint IS NOT NULL AND a.number = $4))
              AND a.start_at > now() - INTERVAL '90 days'
            ORDER BY a.start_at DESC
            LIMIT $5`,
          [ctx.tenantId, scope, like, numeric, Math.min(limit, 5)],
        );
        for (const row of appointments.rows) {
          items.push({
            type: 'appointment',
            id: row.id,
            title: `${row.service_name} · ${row.patient_name ?? row.guardian_name ?? 'Sem paciente'}`,
            subtitle: row.start_at.toISOString(),
            href: `/agenda?agendamento=${row.id}`,
          });
        }
      }

      if (ctx.permissions.has('encounter:read') && numeric !== null) {
        const encounters = await tx.query<{
          id: string;
          number: string;
          patient_name: string;
          status: string;
          arrived_at: Date | null;
        }>(
          `SELECT e.id, e.number::text AS number, p.name AS patient_name, e.status, e.arrived_at
             FROM clinical.encounters e
             JOIN registry.patients p ON p.id = e.patient_id AND p.tenant_id = e.tenant_id
            WHERE e.tenant_id = $1 AND e.number = $2
              AND ($3::uuid[] IS NULL OR e.facility_id = ANY($3))
            LIMIT 5`,
          [ctx.tenantId, numeric, scope],
        );
        for (const row of encounters.rows) {
          items.push({
            type: 'encounter',
            id: row.id,
            title: `Atendimento #${row.number} · ${row.patient_name}`,
            subtitle: row.arrived_at?.toISOString() ?? null,
            href: `/atendimentos/${row.id}`,
          });
        }
      }

      await this.audit.recordAccess(tx, ctx, { resource: 'search', purpose: `q:${query.length}` });

      return { items: items.slice(0, limit * 2) };
    });
  }

  /**
   * Leitura de código (câmera, leitor USB ou Bluetooth, digitação).
   * O cliente envia o texto bruto; a interpretação acontece aqui.
   */
  async scan(ctx: RequestContext, raw: string): Promise<ScanTarget> {
    const parsed = parseIdentifier(raw);

    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const candidates: string[] = [raw.trim()];
      if (parsed.serial) candidates.push(parsed.serial);
      if (parsed.internalCode) candidates.push(parsed.internalCode);

      const patient = await tx.query<{ id: string; name: string; species_name: string }>(
        `SELECT p.id, p.name, s.name_pt AS species_name
           FROM registry.patients p
           JOIN registry.species s ON s.id = p.species_id
          WHERE p.tenant_id = $1 AND p.deleted_at IS NULL
            AND (
              p.internal_code = ANY($2)
              OR EXISTS (SELECT 1 FROM registry.patient_identifiers pi
                          WHERE pi.patient_id = p.id AND pi.tenant_id = p.tenant_id
                            AND pi.value = ANY($2))
            )
          LIMIT 1`,
        [ctx.tenantId, candidates],
      );

      const found = patient.rows[0];
      if (found) {
        return {
          kind: 'patient' as const,
          id: found.id,
          label: `${found.name} (${found.species_name})`,
          href: `/pacientes/${found.id}`,
          parsed,
        };
      }

      return { kind: 'unknown' as const, parsed };
    });
  }
}
