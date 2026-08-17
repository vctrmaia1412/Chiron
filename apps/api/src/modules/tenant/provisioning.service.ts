import { Injectable } from '@nestjs/common';
import type { ClientBase } from 'pg';
import { DatabaseService } from '../../database/database.service';
import { CryptoService } from '../../common/crypto.service';
import { MailerService, invitationUrl } from '../../common/mailer.service';
import { AppError } from '../../common/errors';
import { logger } from '../../common/logger';
import { uuidv7 } from '../../common/uuid';

/**
 * Criação de uma organização do zero: tenant, entitlements do plano, unidade
 * padrão, conta do proprietário, membership, papel e convite para a pessoa
 * definir a própria senha. Antes disso só existia o seed de demonstração, que
 * se recusa a rodar em produção, e colocar uma clínica no ar exigia SQL à mão.
 *
 * A função recebe o executor em vez de abrir a própria conexão: assim o seed
 * de demonstração usa exatamente o mesmo caminho, dentro da transação dele, e
 * as duas rotinas não divergem com o tempo. `ClientBase` é a base comum do
 * `Client` (utilitários de linha de comando) e do `PoolClient` (`withAdmin`).
 */

/** Identificador de URL: minúsculas, números e hífen entre blocos. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface ProvisionFacilityInput {
  name: string;
  code: string;
  /** Endereço no mesmo formato usado nas demais unidades (street, city, ...). */
  address?: Record<string, unknown> | null;
  phone?: string | null;
}

export interface ProvisionOwnerInput {
  email: string;
  name: string;
  council?: string | null;
  councilNumber?: string | null;
  councilState?: string | null;
  /**
   * Hash argon2id já pronto. Só o seed de demonstração preenche: quando vem
   * definido, o convite não é gerado, porque a senha já existe.
   */
  passwordHash?: string | null;
}

export interface ProvisionTenantInput {
  slug: string;
  name: string;
  planKey: string;
  timezone?: string;
  locale?: string;
  /** `trial` é o padrão: a organização nasce em avaliação. */
  status?: 'trial' | 'active';
  settings?: Record<string, unknown>;
  facility: ProvisionFacilityInput;
  owner: ProvisionOwnerInput;
}

export interface ProvisionTenantResult {
  tenantId: string;
  facilityId: string;
  ownerUserId: string;
  membershipId: string;
  professionalId: string | null;
  /** Token do convite. Nulo quando a senha do proprietário já veio pronta. */
  invitationToken: string | null;
}

const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

export async function provisionTenant(
  tx: ClientBase,
  input: ProvisionTenantInput,
  crypto: CryptoService,
): Promise<ProvisionTenantResult> {
  const slug = input.slug.trim().toLowerCase();
  if (!SLUG_PATTERN.test(slug) || slug.length < 2 || slug.length > 63) {
    throw AppError.validation(
      'O identificador da organização aceita apenas letras minúsculas, números e hífen, com 2 a 63 caracteres.',
    );
  }
  const email = input.owner.email.trim().toLowerCase();
  const timezone = input.timezone ?? DEFAULT_TIMEZONE;

  const duplicate = await tx.query(`SELECT 1 FROM platform.tenants WHERE slug = $1`, [slug]);
  if (duplicate.rows.length > 0) {
    throw AppError.conflict(`Já existe uma organização com o identificador "${slug}". Escolha outro.`);
  }

  const plan = await tx.query<{ id: string }>(`SELECT id FROM platform.plans WHERE key = $1 AND active`, [
    input.planKey,
  ]);
  const planId = plan.rows[0]?.id;
  if (!planId) {
    throw AppError.validation(
      `Plano "${input.planKey}" não encontrado. Rode a sincronização de dados de referência antes.`,
    );
  }

  // O papel de proprietário é o global sincronizado por reference-data. Buscar
  // antes de escrever evita criar meia organização quando falta o catálogo.
  const ownerRole = await tx.query<{ id: string }>(
    `SELECT id FROM iam.roles WHERE key = 'owner' AND tenant_id IS NULL`,
  );
  const ownerRoleId = ownerRole.rows[0]?.id;
  if (!ownerRoleId) {
    throw AppError.validation(
      'Papéis do sistema não encontrados. Rode a sincronização de dados de referência antes.',
    );
  }

  const tenantId = uuidv7();
  await tx.query(
    `INSERT INTO platform.tenants (id, slug, name, status, plan_id, timezone, locale, settings)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      tenantId,
      slug,
      input.name,
      input.status ?? 'trial',
      planId,
      timezone,
      input.locale ?? 'pt-BR',
      JSON.stringify(input.settings ?? {}),
    ],
  );

  // Os entitlements saem de platform.plan_modules, nunca de uma lista fixa:
  // mudar a composição do plano no catálogo passa a valer para quem for criado
  // depois, sem editar este arquivo.
  await tx.query(
    `INSERT INTO platform.tenant_entitlements (tenant_id, module_key, state, source)
     SELECT $1::uuid, pm.module_key, 'active', 'plan'
       FROM platform.plan_modules pm
      WHERE pm.plan_id = $2
     ON CONFLICT (tenant_id, module_key) DO NOTHING`,
    [tenantId, planId],
  );

  const facilityId = uuidv7();
  await tx.query(
    `INSERT INTO platform.facilities
       (id, tenant_id, name, code, kind, address, phone, timezone, is_default)
     VALUES ($1,$2,$3,$4,'clinic',$5,$6,$7,true)`,
    [
      facilityId,
      tenantId,
      input.facility.name,
      input.facility.code,
      input.facility.address ? JSON.stringify(input.facility.address) : null,
      input.facility.phone ?? null,
      timezone,
    ],
  );

  // A conta pode já existir: a mesma pessoa costuma responder por mais de uma
  // organização. Nesse caso o nome dela não é sobrescrito, porque o cadastro é
  // dela, e a senha atual só sai do lugar quando vem uma pronta (só o seed
  // manda). No provisionamento de verdade a senha nasce nula e é definida pelo
  // convite.
  const user = await tx.query<{ id: string }>(
    `INSERT INTO iam.users (id, email, name, password_hash, status, is_platform_staff)
     VALUES ($1,$2,$3,$4,'active',false)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash)
     RETURNING id`,
    [uuidv7(), email, input.owner.name, input.owner.passwordHash ?? null],
  );
  const ownerUserId = user.rows[0]?.id;
  if (!ownerUserId) throw AppError.conflict('Não foi possível criar a conta do proprietário.');

  let professionalId: string | null = null;
  if (input.owner.councilNumber) {
    professionalId = uuidv7();
    await tx.query(
      `INSERT INTO registry.professionals
         (id, tenant_id, user_id, name, council, council_number, council_state, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true)`,
      [
        professionalId,
        tenantId,
        ownerUserId,
        input.owner.name,
        input.owner.council ?? 'CRMV',
        input.owner.councilNumber,
        input.owner.councilState ?? null,
      ],
    );
  }

  // A membership já nasce ativa mesmo antes do aceite: se o convite expirar, o
  // proprietário ainda entra pelo "esqueci minha senha", em vez de ficar de
  // fora da própria organização sem ninguém para reconvidá-lo.
  const membershipId = uuidv7();
  await tx.query(
    `INSERT INTO iam.memberships
       (id, tenant_id, user_id, status, is_owner, professional_id, all_facilities, default_facility_id)
     VALUES ($1,$2,$3,'active',true,$4,true,$5)`,
    [membershipId, tenantId, ownerUserId, professionalId, facilityId],
  );
  await tx.query(`INSERT INTO iam.membership_roles (membership_id, role_id, tenant_id) VALUES ($1,$2,$3)`, [
    membershipId,
    ownerRoleId,
    tenantId,
  ]);

  let invitationToken: string | null = null;
  if (!input.owner.passwordHash) {
    invitationToken = crypto.randomToken();
    // `professional` fica nulo de propósito: o profissional já foi criado e
    // vinculado acima, e o aceite do convite criaria um segundo registro,
    // batendo no índice único de conselho.
    await tx.query(
      `INSERT INTO iam.invitations
         (id, tenant_id, email, name, role_id, facility_ids, all_facilities, professional, token_hash, expires_at)
       VALUES ($1,$2,$3,$4,$5,'{}',true,NULL,$6, now() + interval '14 days')`,
      [uuidv7(), tenantId, email, input.owner.name, ownerRoleId, crypto.tokenHash(invitationToken)],
    );
  }

  // Sem ator humano: a criação vem de linha de comando ou de rotina interna.
  // O registro não leva dado pessoal, só o que identifica a organização.
  await tx.query(
    `INSERT INTO audit.audit_log
       (id, tenant_id, actor_type, category, action, entity_schema, entity_table, entity_id, after)
     VALUES ($1,$2,'system','mutation','tenant.provision','platform','tenants',$2,$3)`,
    [uuidv7(), tenantId, JSON.stringify({ slug, planKey: input.planKey, facilityCode: input.facility.code })],
  );

  return { tenantId, facilityId, ownerUserId, membershipId, professionalId, invitationToken };
}

@Injectable()
export class ProvisioningService {
  constructor(
    private readonly db: DatabaseService,
    private readonly crypto: CryptoService,
    private readonly mailer: MailerService,
  ) {}

  /**
   * `platform.tenants` tem RLS forçada e nenhuma política de INSERT: o papel da
   * aplicação não consegue criar organização nenhuma, por construção. Por isso
   * o provisionamento roda no pool administrativo, o único com BYPASSRLS, e em
   * uma única transação: meia organização é pior que nenhuma.
   */
  async provision(input: ProvisionTenantInput): Promise<ProvisionTenantResult> {
    const result = await this.db.withAdmin((tx) => provisionTenant(tx, input, this.crypto));

    if (result.invitationToken) {
      // O envio fica fora da transação e a falha dele não desfaz a organização:
      // o slug já foi tomado e repetir o provisionamento daria conflito. O erro
      // vai para o log e o token continua no retorno, que é como quem executou
      // entrega o link à mão.
      try {
        await this.mailer.sendInvitation({
          to: input.owner.email.trim().toLowerCase(),
          recipientName: input.owner.name,
          organizationName: input.name,
          url: invitationUrl(result.invitationToken),
        });
      } catch (error) {
        logger.error({ err: error, tenantId: result.tenantId }, 'Falha ao enviar o convite do proprietário');
      }
    }

    return result;
  }
}
