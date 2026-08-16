import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { CreateUpload, DocumentDto, GenerateDocument } from '@chiron/contracts';
import { DatabaseService } from '../../database/database.service';
import { AuditService } from '../../common/audit.service';
import { AppError } from '../../common/errors';
import { uuidv7 } from '../../common/uuid';
import type { RequestContext } from '../../common/request-context';
import { contextToTenantContext } from '../../common/request-context';
import { StorageService } from './storage.service';
import { PdfService } from './pdf.service';

const EXTENSION_BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class DocumentsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly pdf: PdfService,
  ) {}

  async list(ctx: RequestContext, params: { patientId?: string; encounterId?: string; kind?: string; limit: number }) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query<{
        id: string;
        kind: string;
        title: string;
        mime_type: string;
        size_bytes: string;
        status: string;
        virus_scan_status: string;
        created_at: Date;
        generated_from_table: string | null;
        uploaded_by_name: string | null;
        links: Array<{ targetType: string; targetId: string }> | null;
      }>(
        `SELECT d.id, d.kind, d.title, d.mime_type, d.size_bytes::text, d.status, d.virus_scan_status,
                d.created_at, d.generated_from_table, u.name AS uploaded_by_name,
                (SELECT json_agg(json_build_object('targetType', dl.target_type, 'targetId', dl.target_id))
                   FROM documents.document_links dl
                  WHERE dl.document_id = d.id AND dl.tenant_id = d.tenant_id) AS links
           FROM documents.documents d
           LEFT JOIN iam.users u ON u.id = d.uploaded_by
          WHERE d.tenant_id = $1 AND d.status = 'active'
            AND ($2::uuid IS NULL OR EXISTS (
                  SELECT 1 FROM documents.document_links l
                   WHERE l.document_id = d.id AND l.tenant_id = d.tenant_id
                     AND l.target_type = 'patient' AND l.target_id = $2))
            AND ($3::uuid IS NULL OR EXISTS (
                  SELECT 1 FROM documents.document_links l2
                   WHERE l2.document_id = d.id AND l2.tenant_id = d.tenant_id
                     AND l2.target_type = 'encounter' AND l2.target_id = $3))
            AND ($4::text IS NULL OR d.kind = $4)
          ORDER BY d.created_at DESC
          LIMIT $5`,
        [ctx.tenantId, params.patientId ?? null, params.encounterId ?? null, params.kind ?? null, params.limit],
      );

      const items: DocumentDto[] = rows.map((r) => ({
        id: r.id,
        kind: r.kind as DocumentDto['kind'],
        title: r.title,
        mimeType: r.mime_type,
        sizeBytes: Number(r.size_bytes),
        status: r.status as DocumentDto['status'],
        virusScanStatus: r.virus_scan_status as DocumentDto['virusScanStatus'],
        createdAt: r.created_at.toISOString(),
        uploadedByName: r.uploaded_by_name,
        links: (r.links ?? []) as DocumentDto['links'],
        generatedFrom: r.generated_from_table,
      }));
      return { items };
    });
  }

  /** Passo 1 do upload: registra o documento e devolve URL assinada. */
  async createUpload(ctx: RequestContext, input: CreateUpload) {
    if (!this.storage.isAvailable()) {
      throw new AppError('INTERNAL_ERROR', 'Armazenamento de arquivos indisponível no momento.');
    }

    const documentId = uuidv7();
    const extension = EXTENSION_BY_MIME[input.mimeType] ?? 'bin';
    const key = this.storage.buildKey(ctx.tenantId as string, input.kind, documentId, extension);

    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      await tx.query(
        `INSERT INTO documents.documents
           (id, tenant_id, facility_id, kind, title, storage_key, mime_type, size_bytes,
            uploaded_by, status, virus_scan_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending_upload','pending')`,
        [
          documentId,
          ctx.tenantId,
          ctx.facilityId,
          input.kind,
          input.title,
          key,
          input.mimeType,
          input.sizeBytes,
          ctx.user.id,
        ],
      );

      for (const link of input.links) {
        await tx.query(
          `INSERT INTO documents.document_links (tenant_id, document_id, target_type, target_id)
           VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
          [ctx.tenantId, documentId, link.targetType, link.targetId],
        );
      }
    });

    const uploadUrl = await this.storage.presignUpload(key, input.mimeType);
    return {
      documentId,
      uploadUrl,
      method: 'PUT' as const,
      headers: { 'Content-Type': input.mimeType },
      expiresInSeconds: 900,
    };
  }

  /** Passo 2: valida magic bytes e marca o documento como ativo. */
  async completeUpload(ctx: RequestContext, documentId: string) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query<{ storage_key: string; mime_type: string; status: string }>(
        `SELECT storage_key, mime_type, status FROM documents.documents
          WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [documentId, ctx.tenantId],
      );
      const doc = rows[0];
      if (!doc) throw AppError.notFound('Documento');
      if (doc.status === 'active') return { ok: true };

      const buffer = await this.storage.get(doc.storage_key);
      if (!buffer) throw AppError.validation('Arquivo não encontrado no armazenamento. Refaça o envio.');

      const detected = StorageService.detectMime(buffer);
      if (!detected || detected !== doc.mime_type) {
        await this.storage.remove(doc.storage_key);
        await tx.query(`UPDATE documents.documents SET status = 'entered_in_error' WHERE id = $1 AND tenant_id = $2`, [
          documentId,
          ctx.tenantId,
        ]);
        throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'O conteúdo do arquivo não corresponde ao tipo informado.');
      }

      const sha256 = createHash('sha256').update(buffer).digest('hex');

      await tx.query(
        `UPDATE documents.documents
            SET status = 'active', size_bytes = $3, sha256 = $4, virus_scan_status = 'skipped'
          WHERE id = $1 AND tenant_id = $2`,
        [documentId, ctx.tenantId, buffer.length, sha256],
      );

      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'document.upload',
        entitySchema: 'documents',
        entityTable: 'documents',
        entityId: documentId,
        after: { sizeBytes: buffer.length },
      });

      return { ok: true };
    });
  }

  async downloadUrl(ctx: RequestContext, documentId: string) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query<{
        storage_key: string;
        title: string;
        mime_type: string;
        status: string;
        virus_scan_status: string;
        patient_id: string | null;
      }>(
        `SELECT d.storage_key, d.title, d.mime_type, d.status, d.virus_scan_status,
                (SELECT dl.target_id FROM documents.document_links dl
                  WHERE dl.document_id = d.id AND dl.tenant_id = d.tenant_id AND dl.target_type = 'patient'
                  LIMIT 1) AS patient_id
           FROM documents.documents d
          WHERE d.id = $1 AND d.tenant_id = $2`,
        [documentId, ctx.tenantId],
      );
      const doc = rows[0];
      if (!doc) throw AppError.notFound('Documento');
      if (doc.status !== 'active') throw AppError.validation('Documento indisponível para download.');
      if (doc.virus_scan_status === 'infected') {
        throw AppError.forbidden('Arquivo bloqueado pela verificação de segurança.');
      }

      const extension = EXTENSION_BY_MIME[doc.mime_type] ?? 'bin';
      const url = await this.storage.presignDownload(doc.storage_key, `${doc.title}.${extension}`);

      await this.audit.recordAccess(tx, ctx, {
        resource: 'document',
        resourceId: documentId,
        patientId: doc.patient_id,
      });

      return { url, expiresInSeconds: 300 };
    });
  }

  /** Grava um PDF gerado pelo próprio sistema (receita, atestado, carteira). */
  async storeGeneratedInTx(
    tx: PoolClient,
    ctx: RequestContext,
    input: {
      kind: string;
      title: string;
      buffer: Buffer;
      mimeType: string;
      generatedFromTable?: string;
      generatedFromId?: string;
      templateKey?: string;
      links: Array<{ targetType: string; targetId: string }>;
    },
  ): Promise<{ id: string }> {
    const documentId = uuidv7();
    const extension = EXTENSION_BY_MIME[input.mimeType] ?? 'pdf';
    const key = this.storage.buildKey(ctx.tenantId as string, input.kind, documentId, extension);
    const sha256 = createHash('sha256').update(input.buffer).digest('hex');

    if (this.storage.isAvailable()) {
      await this.storage.put(key, input.buffer, input.mimeType);
    }

    await tx.query(
      `INSERT INTO documents.documents
         (id, tenant_id, facility_id, kind, title, storage_key, mime_type, size_bytes, sha256,
          generated_from_table, generated_from_id, template_key, uploaded_by, status, virus_scan_status,
          contains_personal_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'active','skipped',true)`,
      [
        documentId,
        ctx.tenantId,
        ctx.facilityId,
        input.kind,
        input.title,
        key,
        input.mimeType,
        input.buffer.length,
        sha256,
        input.generatedFromTable ?? null,
        input.generatedFromId ?? null,
        input.templateKey ?? null,
        ctx.user.id,
      ],
    );

    for (const link of input.links) {
      await tx.query(
        `INSERT INTO documents.document_links (tenant_id, document_id, target_type, target_id)
         VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [ctx.tenantId, documentId, link.targetType, link.targetId],
      );
    }

    return { id: documentId };
  }

  /** Documentos por modelo: atestados, declaração, encaminhamento, carteira. */
  async generate(ctx: RequestContext, input: GenerateDocument) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const tenant = await tx.query<{ name: string; settings: Record<string, unknown> }>(
        `SELECT name, settings FROM platform.tenants WHERE id = $1`,
        [ctx.tenantId],
      );
      const tenantName = tenant.rows[0]?.name ?? 'Clínica';
      const header = (tenant.rows[0]?.settings?.['prescriptionHeader'] as string) ?? null;

      const patientId =
        input.targetType === 'patient'
          ? input.targetId
          : input.targetType === 'encounter'
            ? (
                await tx.query<{ patient_id: string }>(
                  `SELECT patient_id FROM clinical.encounters WHERE id = $1 AND tenant_id = $2`,
                  [input.targetId, ctx.tenantId],
                )
              ).rows[0]?.patient_id
            : undefined;

      if (!patientId) throw AppError.validation('Informe um paciente ou atendimento válido.');

      const patient = await tx.query<{
        name: string;
        species: string;
        breed: string | null;
        birth_date: Date | null;
        guardian_name: string | null;
      }>(
        `SELECT p.name, s.name_pt AS species, b.name AS breed, p.birth_date,
                (SELECT gu.name FROM registry.patient_guardians pg
                   JOIN registry.guardians gu ON gu.id = pg.guardian_id AND gu.tenant_id = pg.tenant_id
                  WHERE pg.patient_id = p.id AND pg.tenant_id = p.tenant_id AND pg.valid_to IS NULL
                  ORDER BY pg.is_primary DESC LIMIT 1) AS guardian_name
           FROM registry.patients p
           JOIN registry.species s ON s.id = p.species_id
           LEFT JOIN registry.breeds b ON b.id = p.breed_id
          WHERE p.id = $1 AND p.tenant_id = $2`,
        [patientId, ctx.tenantId],
      );
      const p = patient.rows[0];
      if (!p) throw AppError.notFound('Paciente');

      const professional = { name: ctx.user.name, council: null as string | null };
      if (ctx.professionalId) {
        const prof = await tx.query<{ name: string; council_number: string | null }>(
          `SELECT name, council_number FROM registry.professionals WHERE id = $1 AND tenant_id = $2`,
          [ctx.professionalId, ctx.tenantId],
        );
        if (prof.rows[0]) {
          professional.name = prof.rows[0].name;
          professional.council = prof.rows[0].council_number;
        }
      }

      const patientLabel = `${p.name} (${p.species}${p.breed ? `, ${p.breed}` : ''})`;
      const guardianLabel = p.guardian_name ?? 'tutor não identificado';
      const fields = input.fields as Record<string, string | undefined>;

      let buffer: Buffer;
      let title: string;
      let kind: string;

      switch (input.templateKey) {
        case 'vaccination_card': {
          const vaccines = await tx.query<{
            name: string;
            date: Date;
            lot: string | null;
            next: Date | null;
            professional: string | null;
          }>(
            `SELECT i.vaccine_name AS name, i.administered_at AS date, i.lot_number AS lot,
                    i.next_due_at AS next, pr.name AS professional
               FROM immunization.immunizations i
               LEFT JOIN registry.professionals pr ON pr.id = i.professional_id AND pr.tenant_id = i.tenant_id
              WHERE i.tenant_id = $1 AND i.patient_id = $2 AND i.status = 'completed'
              ORDER BY i.administered_at DESC`,
            [ctx.tenantId, patientId],
          );
          const preventives = await tx.query<{ name: string; date: Date; kind: string; next: Date | null }>(
            `SELECT product_name AS name, administered_at AS date, kind, next_due_at AS next
               FROM immunization.preventive_treatments
              WHERE tenant_id = $1 AND patient_id = $2
              ORDER BY administered_at DESC`,
            [ctx.tenantId, patientId],
          );

          buffer = await this.pdf.vaccinationCard({
            tenantName,
            patient: { name: p.name, species: p.species, breed: p.breed, guardianName: p.guardian_name },
            vaccines: vaccines.rows.map((v) => ({
              name: v.name,
              date: v.date.toLocaleDateString('pt-BR'),
              lot: v.lot,
              nextDue: v.next ? v.next.toLocaleDateString('pt-BR') : null,
              professional: v.professional,
            })),
            preventives: preventives.rows.map((v) => ({
              name: v.name,
              date: v.date.toLocaleDateString('pt-BR'),
              kind: v.kind === 'deworming' ? 'Vermífugo' : v.kind === 'ectoparasite' ? 'Antiparasitário' : 'Preventivo',
              nextDue: v.next ? v.next.toLocaleDateString('pt-BR') : null,
            })),
          });
          title = `Carteira de vacinação - ${p.name}`;
          kind = 'vaccination_certificate';
          break;
        }

        case 'medical_record': {
          const encounters = await tx.query<{
            date: Date;
            service: string | null;
            professional: string | null;
            status: string;
            id: string;
          }>(
            `SELECT COALESCE(e.started_at, e.arrived_at, e.created_at) AS date, sc.name AS service,
                    pr.name AS professional, e.status, e.id
               FROM clinical.encounters e
               LEFT JOIN registry.service_catalog sc ON sc.id = e.service_id AND sc.tenant_id = e.tenant_id
               LEFT JOIN registry.professionals pr ON pr.id = e.attending_professional_id AND pr.tenant_id = e.tenant_id
              WHERE e.tenant_id = $1 AND e.patient_id = $2 AND e.status <> 'entered_in_error'
              ORDER BY 1 DESC LIMIT 100`,
            [ctx.tenantId, patientId],
          );

          const sections = await tx.query<{ encounter_id: string; kind: string; body: string }>(
            `SELECT encounter_id, kind, body FROM clinical.encounter_notes
              WHERE tenant_id = $1 AND patient_id = $2 AND status IN ('final','amended') AND body <> ''
              ORDER BY sequence`,
            [ctx.tenantId, patientId],
          );

          const diagnoses = await tx.query<{ encounter_id: string; description: string }>(
            `SELECT encounter_id, description FROM clinical.encounter_diagnoses
              WHERE tenant_id = $1 AND patient_id = $2`,
            [ctx.tenantId, patientId],
          );

          const noteTitles: Record<string, string> = {
            triage: 'Triagem',
            chief_complaint: 'Queixa principal',
            history: 'Anamnese',
            physical_exam: 'Exame físico',
            assessment: 'Avaliação',
            plan: 'Conduta',
            progress: 'Evolução',
            nursing: 'Enfermagem',
            procedure_note: 'Procedimento',
            anesthesia_note: 'Anestesia',
            discharge_summary: 'Alta',
            addendum: 'Adendo',
            free: 'Observações',
          };

          buffer = await this.pdf.medicalRecord({
            tenantName,
            patient: {
              name: p.name,
              species: p.species,
              breed: p.breed,
              guardianName: p.guardian_name,
              birthDate: p.birth_date ? p.birth_date.toLocaleDateString('pt-BR') : null,
            },
            encounters: encounters.rows.map((e) => ({
              date: e.date.toLocaleDateString('pt-BR'),
              service: e.service,
              professional: e.professional,
              status: e.status === 'finished' ? 'Finalizado' : e.status,
              sections: sections.rows
                .filter((s) => s.encounter_id === e.id)
                .map((s) => ({ title: noteTitles[s.kind] ?? s.kind, body: s.body })),
              diagnoses: diagnoses.rows.filter((d) => d.encounter_id === e.id).map((d) => d.description),
            })),
          });
          title = `Prontuário - ${p.name}`;
          kind = 'medical_record';
          break;
        }

        default: {
          const templates: Record<string, { title: string; kind: string; body: (f: Record<string, string | undefined>) => string[]; foot?: string }> = {
            health_certificate: {
              title: 'Atestado de Saúde',
              kind: 'health_certificate',
              body: (f) => [
                `Atesto para os devidos fins que o animal ${patientLabel}, de propriedade de ${guardianLabel}, foi examinado nesta data e encontra-se clinicamente ${f.condition ?? 'saudável'}.`,
                f.purpose ? `Finalidade: ${f.purpose}.` : 'Finalidade: apresentação a quem possa interessar.',
                f.observations ?? '',
              ],
            },
            vaccination_certificate: {
              title: 'Atestado de Vacinação',
              kind: 'vaccination_certificate',
              body: (f) => [
                `Atesto que o animal ${patientLabel}, de propriedade de ${guardianLabel}, recebeu as vacinas conforme registro no prontuário desta clínica.`,
                f.observations ?? '',
              ],
            },
            attendance_statement: {
              title: 'Declaração de Comparecimento',
              kind: 'attendance_statement',
              body: (f) => [
                `Declaro que ${guardianLabel} compareceu a esta unidade nesta data para atendimento do animal ${patientLabel}.`,
                f.period ? `Período: ${f.period}.` : '',
              ],
            },
            referral_letter: {
              title: 'Carta de Encaminhamento',
              kind: 'referral_letter',
              body: (f) => [
                `Encaminho o animal ${patientLabel}, de propriedade de ${guardianLabel}, para avaliação ${f.to ? `de ${f.to}` : 'especializada'}.`,
                f.reason ? `Motivo: ${f.reason}.` : '',
                f.summary ? `Resumo clínico: ${f.summary}` : '',
              ],
            },
            death_certificate: {
              title: 'Atestado de Óbito Animal',
              kind: 'death_certificate',
              body: (f) => [
                `Atesto o óbito do animal ${patientLabel}, de propriedade de ${guardianLabel}, ocorrido em ${f.occurredAt ?? new Date().toLocaleDateString('pt-BR')}.`,
                f.cause ? `Causa provável: ${f.cause}.` : '',
                f.observations ?? '',
              ],
            },
            consent_treatment: {
              title: 'Termo de Consentimento para Tratamento',
              kind: 'consent',
              body: () => [
                `Eu, ${guardianLabel}, responsável pelo animal ${patientLabel}, autorizo a realização dos procedimentos clínicos indicados pela equipe veterinária, tendo sido informado sobre riscos, alternativas e cuidados necessários.`,
              ],
              foot: 'Assinatura do responsável: ______________________________________',
            },
            consent_surgery: {
              title: 'Termo de Consentimento Cirúrgico',
              kind: 'consent',
              body: (f) => [
                `Eu, ${guardianLabel}, responsável pelo animal ${patientLabel}, autorizo a realização do procedimento cirúrgico ${f.procedure ?? 'indicado'}, ciente dos riscos inerentes ao ato cirúrgico e à anestesia.`,
              ],
              foot: 'Assinatura do responsável: ______________________________________',
            },
            consent_anesthesia: {
              title: 'Termo de Consentimento Anestésico',
              kind: 'consent',
              body: () => [
                `Eu, ${guardianLabel}, responsável pelo animal ${patientLabel}, autorizo a realização do protocolo anestésico indicado, ciente de que existem riscos que independem da técnica empregada.`,
              ],
              foot: 'Assinatura do responsável: ______________________________________',
            },
            consent_euthanasia: {
              title: 'Termo de Consentimento para Eutanásia',
              kind: 'consent',
              body: (f) => [
                `Eu, ${guardianLabel}, responsável pelo animal ${patientLabel}, autorizo a realização da eutanásia, ciente do diagnóstico e do prognóstico apresentados pela equipe veterinária.`,
                f.reason ? `Justificativa clínica: ${f.reason}.` : '',
              ],
              foot: 'Assinatura do responsável: ______________________________________',
            },
          };

          const template = templates[input.templateKey];
          if (!template) throw AppError.validation('Modelo de documento não suportado.');

          buffer = await this.pdf.certificate({
            tenantName,
            header,
            title: template.title,
            issuedAt: new Date(),
            patient: { name: p.name, species: p.species, breed: p.breed, guardianName: p.guardian_name },
            professional,
            bodyLines: template.body(fields).filter((l) => l.trim().length > 0),
            footNote: template.foot ?? null,
          });
          title = `${template.title} - ${p.name}`;
          kind = template.kind;
        }
      }

      const links: Array<{ targetType: string; targetId: string }> = [
        { targetType: 'patient', targetId: patientId },
      ];
      if (input.targetType === 'encounter') links.push({ targetType: 'encounter', targetId: input.targetId });

      const document = await this.storeGeneratedInTx(tx, ctx, {
        kind,
        title,
        buffer,
        mimeType: 'application/pdf',
        templateKey: input.templateKey,
        generatedFromTable: input.targetType === 'encounter' ? 'clinical.encounters' : 'registry.patients',
        generatedFromId: input.targetId,
        links,
      });

      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'document.generate',
        entitySchema: 'documents',
        entityTable: 'documents',
        entityId: document.id,
        after: { templateKey: input.templateKey },
      });

      return { documentId: document.id, title };
    });
  }

  async createConsent(ctx: RequestContext, input: Record<string, unknown>) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const id = uuidv7();
      await tx.query(
        `INSERT INTO documents.consents
           (id, tenant_id, guardian_id, patient_id, kind, text_version, method, evidence_document_id, ip, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          id,
          ctx.tenantId,
          input.guardianId,
          input.patientId ?? null,
          input.kind,
          input.textVersion ?? 'v1',
          input.method ?? 'digital_click',
          input.documentId ?? null,
          ctx.ip,
          ctx.user.id,
        ],
      );
      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'consent.create',
        entitySchema: 'documents',
        entityTable: 'consents',
        entityId: id,
        after: { kind: input.kind },
      });
      return { id };
    });
  }

  async listConsents(ctx: RequestContext, guardianId: string) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query(
        `SELECT c.id, c.guardian_id AS "guardianId", g.name AS "guardianName", c.patient_id AS "patientId",
                c.kind, c.text_version AS "textVersion", c.granted_at AS "grantedAt",
                c.revoked_at AS "revokedAt", c.method, c.evidence_document_id AS "documentId"
           FROM documents.consents c
           JOIN registry.guardians g ON g.id = c.guardian_id AND g.tenant_id = c.tenant_id
          WHERE c.tenant_id = $1 AND c.guardian_id = $2
          ORDER BY c.granted_at DESC`,
        [ctx.tenantId, guardianId],
      );
      return { items: rows };
    });
  }
}
