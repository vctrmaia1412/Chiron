import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type {
  InvitationPendingConflict,
  InviteMemberRequest,
  Member,
  PendingInvitation,
  RoleSummary,
} from '@chiron/contracts';
import { DatabaseService } from '../../database/database.service';
import { AuditService } from '../../common/audit.service';
import { CryptoService } from '../../common/crypto.service';
import { MailerService, invitationUrl } from '../../common/mailer.service';
import { AppError } from '../../common/errors';
import { uuidv7 } from '../../common/uuid';
import type { RequestContext } from '../../common/request-context';
import { contextToTenantContext } from '../../common/request-context';

/** Papel que dá acesso total: só o próprio proprietário pode concedê-lo. */
const OWNER_ROLE_KEY = 'owner';

/** Convite recém-emitido. O token cru só existe aqui e no e-mail; o banco guarda o hash. */
export interface IssuedInvitation {
  id: string;
  token: string;
  email: string;
  expiresAt: string;
}

@Injectable()
export class MembersService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly crypto: CryptoService,
    private readonly mailer: MailerService,
  ) {}

  async list(ctx: RequestContext): Promise<Member[]> {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query<{
        id: string;
        user_id: string;
        name: string;
        email: string;
        status: string;
        is_owner: boolean;
        all_facilities: boolean;
        created_at: Date;
        professional_id: string | null;
        council: string | null;
        council_number: string | null;
        council_state: string | null;
        council_valid_until: Date | null;
        color: string | null;
        roles: Array<{ key: string; name: string }> | null;
        facility_ids: string[] | null;
      }>(
        `SELECT m.id, m.user_id, u.name, u.email::text AS email, m.status, m.is_owner, m.all_facilities, m.created_at,
                p.id AS professional_id, p.council, p.council_number, p.council_state, p.council_valid_until, p.color,
                (SELECT json_agg(json_build_object('key', r.key, 'name', r.name) ORDER BY r.sort)
                   FROM iam.membership_roles mr JOIN iam.roles r ON r.id = mr.role_id
                  WHERE mr.membership_id = m.id) AS roles,
                (SELECT array_agg(mf.facility_id) FROM iam.membership_facilities mf WHERE mf.membership_id = m.id) AS facility_ids
           FROM iam.memberships m
           JOIN iam.users u ON u.id = m.user_id
           LEFT JOIN registry.professionals p ON p.id = m.professional_id
          WHERE m.tenant_id = $1
          ORDER BY m.is_owner DESC, u.name`,
        [ctx.tenantId],
      );

      return rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        name: r.name,
        email: r.email,
        status: r.status as Member['status'],
        isOwner: r.is_owner,
        roles: r.roles ?? [],
        professional: r.professional_id
          ? {
              id: r.professional_id,
              council: r.council,
              councilNumber: r.council_number,
              councilState: r.council_state,
              isLicensed: Boolean(
                r.council_number && (!r.council_valid_until || r.council_valid_until.getTime() >= Date.now()),
              ),
              color: r.color,
            }
          : null,
        allFacilities: r.all_facilities,
        facilityIds: r.facility_ids ?? [],
        createdAt: r.created_at.toISOString(),
      }));
    });
  }

  async invite(ctx: RequestContext, input: InviteMemberRequest): Promise<IssuedInvitation> {
    // Sem esta barreira, quem tem member:invite convida uma segunda conta como
    // proprietário e ganha acesso total à organização.
    if (input.roleKey === OWNER_ROLE_KEY && !ctx.isOwner) {
      throw AppError.forbidden('Somente o proprietário pode conceder o papel de proprietário.');
    }

    const created = await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const role = await tx.query<{ id: string; requires_license: boolean }>(
        `SELECT id, requires_license FROM iam.roles
          WHERE key = $1 AND (tenant_id = $2 OR tenant_id IS NULL) ORDER BY tenant_id NULLS LAST LIMIT 1`,
        [input.roleKey, ctx.tenantId],
      );
      const roleRow = role.rows[0];
      if (!roleRow) {
        throw AppError.validation('Papel desconhecido.', {
          issues: [{ path: 'roleKey', message: 'Escolha um papel da lista.', code: 'custom' }],
        });
      }

      // Quem assina prontuário e receita precisa de CRMV desde o primeiro dia:
      // sem ele o convite vira um veterinário que não consegue finalizar nada.
      if (roleRow.requires_license && !input.professional) {
        throw AppError.validation('Este papel assina prontuário e receita: informe o número e a UF do CRMV.', {
          issues: [
            { path: 'professional.councilNumber', message: 'Informe o número do CRMV.', code: 'custom' },
            { path: 'professional.councilState', message: 'Escolha a UF do CRMV.', code: 'custom' },
          ],
        });
      }

      await this.assertNotMember(tx, ctx, input.email);

      // O aceite cria o profissional com este CRMV; repetido, ele batia no
      // índice único só lá na frente, com o convidado já digitando a senha.
      if (input.professional) {
        const taken = await tx.query(
          `SELECT 1 FROM registry.professionals
            WHERE tenant_id = $1 AND council = $2 AND council_number = $3 AND council_state = $4
              AND deleted_at IS NULL`,
          [ctx.tenantId, input.professional.council, input.professional.councilNumber, input.professional.councilState],
        );
        if ((taken.rowCount ?? 0) > 0) {
          throw AppError.conflict('Este CRMV já está cadastrado para outro profissional da clínica.', {
            issues: [
              { path: 'professional.councilNumber', message: 'CRMV já cadastrado nesta clínica.', code: 'custom' },
            ],
          });
        }
      }

      const open = await tx.query<{ id: string; sent_at: Date; expires_at: Date; expired: boolean }>(
        `SELECT id, sent_at, expires_at, expires_at <= now() AS expired
           FROM iam.invitations
          WHERE tenant_id = $1 AND email = $2 AND accepted_at IS NULL AND revoked_at IS NULL
          FOR UPDATE`,
        [ctx.tenantId, input.email],
      );
      const current = open.rows[0];

      // Convidar de novo não troca o link em silêncio: a pessoa pode estar com
      // o e-mail anterior aberto. Trocar o link é o "Reenviar", que avisa.
      if (current && !current.expired) {
        const details: InvitationPendingConflict = {
          reason: 'invitation_pending',
          invitationId: current.id,
          sentAt: current.sent_at.toISOString(),
          expiresAt: current.expires_at.toISOString(),
        };
        throw AppError.conflict(
          'Já existe um convite pendente para este e-mail. Use “Reenviar” para mandar um link novo.',
          details,
        );
      }

      const token = this.crypto.randomToken();
      const professional = input.professional ? JSON.stringify(input.professional) : null;
      let id: string;
      let expiresAt: Date;

      if (current) {
        // Convite vencido: o link antigo já não abria nada, então reaproveitar a
        // linha com os dados novos não derruba link válido de ninguém.
        id = current.id;
        const updated = await tx.query<{ expires_at: Date }>(
          `UPDATE iam.invitations
              SET name = $2, role_id = $3, facility_ids = $4, all_facilities = $5, professional = $6,
                  token_hash = $7, invited_by = $8, sent_at = now(), expires_at = now() + interval '14 days'
            WHERE id = $1
            RETURNING expires_at`,
          [
            id,
            input.name ?? null,
            roleRow.id,
            input.facilityIds,
            input.allFacilities,
            professional,
            this.crypto.tokenHash(token),
            ctx.user.id,
          ],
        );
        expiresAt = updated.rows[0]?.expires_at ?? current.expires_at;
      } else {
        id = uuidv7();
        const inserted = await tx.query<{ expires_at: Date }>(
          `INSERT INTO iam.invitations
             (id, tenant_id, email, name, role_id, facility_ids, all_facilities, professional, token_hash, invited_by,
              sent_at, expires_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now(), now() + interval '14 days')
           RETURNING expires_at`,
          [
            id,
            ctx.tenantId,
            input.email,
            input.name ?? null,
            roleRow.id,
            input.facilityIds,
            input.allFacilities,
            professional,
            this.crypto.tokenHash(token),
            ctx.user.id,
          ],
        );
        const insertedExpiry = inserted.rows[0]?.expires_at;
        if (!insertedExpiry) throw AppError.conflict('Não foi possível registrar o convite.');
        expiresAt = insertedExpiry;
      }

      await this.audit.record(tx, ctx, {
        category: 'authz_change',
        action: 'member.invite',
        entitySchema: 'iam',
        entityTable: 'invitations',
        entityId: id,
        after: { roleKey: input.roleKey, licensed: Boolean(input.professional), replacedExpired: Boolean(current) },
      });

      return {
        id,
        token,
        email: input.email,
        expiresAt: expiresAt.toISOString(),
        recipientName: input.name ?? null,
        organizationName: await this.organizationName(tx, ctx),
      };
    });

    await this.deliver(created);
    return { id: created.id, token: created.token, email: created.email, expiresAt: created.expiresAt };
  }

  /** Convites ainda não aceitos nem revogados, vencidos inclusive: vencido se reenvia. */
  async listInvitations(ctx: RequestContext): Promise<PendingInvitation[]> {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query<{
        id: string;
        email: string;
        name: string | null;
        role_key: string;
        role_name: string;
        invited_by_name: string | null;
        sent_at: Date;
        expires_at: Date;
        expired: boolean;
      }>(
        // Convite de quem já é membro fica de fora: é o do proprietário
        // provisionado, que entrou pelo "esqueci a senha", e não há o que fazer.
        `SELECT i.id, i.email::text AS email, i.name, r.key AS role_key, r.name AS role_name,
                u.name AS invited_by_name, i.sent_at, i.expires_at, i.expires_at <= now() AS expired
           FROM iam.invitations i
           JOIN iam.roles r ON r.id = i.role_id
           LEFT JOIN iam.users u ON u.id = i.invited_by
          WHERE i.tenant_id = $1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM iam.memberships m JOIN iam.users mu ON mu.id = m.user_id
               WHERE m.tenant_id = i.tenant_id AND mu.email = i.email
            )
          ORDER BY i.sent_at DESC`,
        [ctx.tenantId],
      );

      return rows.map((r) => ({
        id: r.id,
        email: r.email,
        name: r.name,
        role: { key: r.role_key, name: r.role_name },
        invitedByName: r.invited_by_name,
        sentAt: r.sent_at.toISOString(),
        expiresAt: r.expires_at.toISOString(),
        status: r.expired ? ('expired' as const) : ('pending' as const),
      }));
    });
  }

  /**
   * Reenvio explícito: gera token novo, renova o prazo e manda outro e-mail.
   * O link anterior deixa de valer, e é por isso que só acontece quando alguém
   * pede, nunca como efeito colateral de convidar de novo.
   */
  async resendInvitation(ctx: RequestContext, invitationId: string): Promise<IssuedInvitation> {
    const issued = await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const invitation = await this.lockInvitation(tx, ctx, invitationId);
      if (invitation.accepted_at) {
        throw AppError.conflict('Este convite já foi aceito: a pessoa já faz parte da equipe.');
      }
      if (invitation.revoked_at) {
        throw AppError.conflict('Este convite foi revogado. Para dar acesso, envie um convite novo.');
      }
      // Reenviar convite de proprietário é concedê-lo de novo.
      if (invitation.role_key === OWNER_ROLE_KEY && !ctx.isOwner) {
        throw AppError.forbidden('Somente o proprietário pode conceder o papel de proprietário.');
      }
      await this.assertNotMember(tx, ctx, invitation.email);

      const token = this.crypto.randomToken();
      const updated = await tx.query<{ expires_at: Date }>(
        `UPDATE iam.invitations
            SET token_hash = $2, sent_at = now(), expires_at = now() + interval '14 days'
          WHERE id = $1
          RETURNING expires_at`,
        [invitation.id, this.crypto.tokenHash(token)],
      );

      await this.audit.record(tx, ctx, {
        category: 'authz_change',
        action: 'member.invite.resend',
        entitySchema: 'iam',
        entityTable: 'invitations',
        entityId: invitation.id,
        after: { roleKey: invitation.role_key, wasExpired: invitation.expired },
      });

      return {
        id: invitation.id,
        token,
        email: invitation.email,
        expiresAt: (updated.rows[0]?.expires_at ?? new Date()).toISOString(),
        recipientName: invitation.name,
        organizationName: await this.organizationName(tx, ctx),
      };
    });

    await this.deliver(issued);
    return { id: issued.id, token: issued.token, email: issued.email, expiresAt: issued.expiresAt };
  }

  /** Revogar derruba o link na hora. Repetir a revogação não é erro. */
  async revokeInvitation(ctx: RequestContext, invitationId: string): Promise<void> {
    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const invitation = await this.lockInvitation(tx, ctx, invitationId);
      if (invitation.accepted_at) {
        throw AppError.conflict('Este convite já foi aceito. Para tirar o acesso, suspenda o membro na lista da equipe.');
      }
      if (invitation.revoked_at) return;

      await tx.query(`UPDATE iam.invitations SET revoked_at = now(), revoked_by = $2 WHERE id = $1`, [
        invitation.id,
        ctx.user.id,
      ]);

      await this.audit.record(tx, ctx, {
        category: 'authz_change',
        action: 'member.invite.revoke',
        entitySchema: 'iam',
        entityTable: 'invitations',
        entityId: invitation.id,
        after: { roleKey: invitation.role_key },
      });
    });
  }

  private async lockInvitation(tx: PoolClient, ctx: RequestContext, invitationId: string) {
    const { rows } = await tx.query<{
      id: string;
      email: string;
      name: string | null;
      role_key: string;
      accepted_at: Date | null;
      revoked_at: Date | null;
      expired: boolean;
    }>(
      `SELECT i.id, i.email::text AS email, i.name, r.key AS role_key, i.accepted_at, i.revoked_at,
              i.expires_at <= now() AS expired
         FROM iam.invitations i
         JOIN iam.roles r ON r.id = i.role_id
        WHERE i.id = $1 AND i.tenant_id = $2
        FOR UPDATE OF i`,
      [invitationId, ctx.tenantId],
    );
    const invitation = rows[0];
    if (!invitation) throw AppError.notFound('Convite');
    return invitation;
  }

  private async assertNotMember(tx: PoolClient, ctx: RequestContext, email: string): Promise<void> {
    const existing = await tx.query(
      `SELECT 1 FROM iam.memberships m JOIN iam.users u ON u.id = m.user_id
        WHERE m.tenant_id = $1 AND u.email = $2`,
      [ctx.tenantId, email],
    );
    if ((existing.rowCount ?? 0) > 0) {
      throw AppError.conflict('Este e-mail já faz parte da organização.', {
        issues: [{ path: 'email', message: 'Este e-mail já faz parte da equipe.', code: 'custom' }],
      });
    }
  }

  /** O nome da organização vai no e-mail: quem recebe precisa saber quem convida antes de digitar senha. */
  private async organizationName(tx: PoolClient, ctx: RequestContext): Promise<string> {
    const tenant = await tx.query<{ name: string }>(`SELECT name FROM platform.tenants WHERE id = $1`, [ctx.tenantId]);
    return tenant.rows[0]?.name ?? 'sua organização';
  }

  /**
   * Fora da transação de propósito: a chamada HTTP ao provedor não pode
   * segurar a conexão do banco. Se o envio falhar, o erro sobe e o convite
   * fica na lista de pendentes, de onde "Reenviar" manda um link novo.
   */
  private async deliver(issued: IssuedInvitation & { recipientName: string | null; organizationName: string }) {
    await this.mailer.sendInvitation({
      to: issued.email,
      recipientName: issued.recipientName,
      organizationName: issued.organizationName,
      url: invitationUrl(issued.token),
    });
  }

  async update(
    ctx: RequestContext,
    membershipId: string,
    input: { roleKey?: string; status?: string; allFacilities?: boolean; facilityIds?: string[] },
  ): Promise<void> {
    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const target = await tx.query<{ id: string; is_owner: boolean; user_id: string }>(
        `SELECT id, is_owner, user_id FROM iam.memberships WHERE id = $1 AND tenant_id = $2`,
        [membershipId, ctx.tenantId],
      );
      const membership = target.rows[0];
      if (!membership) throw AppError.notFound('Membro');

      // Titularidade só se mexe pelas mãos do titular: nem promover outra conta
      // a proprietário, nem rebaixar ou suspender quem já é.
      if (!ctx.isOwner) {
        if (input.roleKey === OWNER_ROLE_KEY) {
          throw AppError.forbidden('Somente o proprietário pode conceder o papel de proprietário.');
        }
        if (membership.is_owner && (input.roleKey !== undefined || input.status !== undefined)) {
          throw AppError.forbidden('Somente o proprietário pode alterar o papel ou a situação do proprietário.');
        }
      }

      if (membership.is_owner && input.status && input.status !== 'active') {
        const owners = await tx.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM iam.memberships WHERE tenant_id = $1 AND is_owner AND status = 'active'`,
          [ctx.tenantId],
        );
        if (Number(owners.rows[0]?.count ?? '0') <= 1) {
          throw AppError.conflict('A organização precisa de ao menos um proprietário ativo.');
        }
      }

      // Não permitir que alguém eleve o próprio conjunto de permissões.
      if (membership.user_id === ctx.user.id && input.roleKey && !ctx.isOwner) {
        throw AppError.forbidden('Você não pode alterar o próprio papel.');
      }

      if (input.status) {
        await tx.query(`UPDATE iam.memberships SET status = $2 WHERE id = $1`, [membershipId, input.status]);
      }
      if (input.allFacilities !== undefined) {
        await tx.query(`UPDATE iam.memberships SET all_facilities = $2 WHERE id = $1`, [
          membershipId,
          input.allFacilities,
        ]);
      }
      if (input.facilityIds) {
        await tx.query(`DELETE FROM iam.membership_facilities WHERE membership_id = $1`, [membershipId]);
        for (const facilityId of input.facilityIds) {
          await tx.query(
            `INSERT INTO iam.membership_facilities (membership_id, facility_id, tenant_id) VALUES ($1,$2,$3)`,
            [membershipId, facilityId, ctx.tenantId],
          );
        }
      }
      if (input.roleKey) {
        const role = await tx.query<{ id: string }>(
          `SELECT id FROM iam.roles WHERE key = $1 AND (tenant_id = $2 OR tenant_id IS NULL) ORDER BY tenant_id NULLS LAST LIMIT 1`,
          [input.roleKey, ctx.tenantId],
        );
        const roleId = role.rows[0]?.id;
        if (!roleId) throw AppError.validation('Papel desconhecido.');
        await tx.query(`DELETE FROM iam.membership_roles WHERE membership_id = $1`, [membershipId]);
        await tx.query(
          `INSERT INTO iam.membership_roles (membership_id, role_id, tenant_id) VALUES ($1,$2,$3)`,
          [membershipId, roleId, ctx.tenantId],
        );
      }

      await tx.query(`UPDATE iam.memberships SET perm_version = perm_version + 1 WHERE id = $1`, [membershipId]);

      await this.audit.record(tx, ctx, {
        category: 'authz_change',
        action: 'member.update',
        entitySchema: 'iam',
        entityTable: 'memberships',
        entityId: membershipId,
        after: { roleKey: input.roleKey, status: input.status, allFacilities: input.allFacilities },
      });
    });
  }

  async remove(ctx: RequestContext, membershipId: string): Promise<void> {
    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const target = await tx.query<{ is_owner: boolean }>(
        `SELECT is_owner FROM iam.memberships WHERE id = $1 AND tenant_id = $2`,
        [membershipId, ctx.tenantId],
      );
      if (!target.rows[0]) throw AppError.notFound('Membro');
      if (target.rows[0].is_owner) throw AppError.conflict('O proprietário não pode ser removido.');

      await tx.query(`UPDATE iam.memberships SET status = 'suspended', perm_version = perm_version + 1 WHERE id = $1`, [
        membershipId,
      ]);
      await this.audit.record(tx, ctx, {
        category: 'authz_change',
        action: 'member.remove',
        entitySchema: 'iam',
        entityTable: 'memberships',
        entityId: membershipId,
      });
    });
  }

  /**
   * Formato de `roleSummarySchema`. A tela de convite decide pelo
   * `requiresLicense` se o CRMV é obrigatório; sem ele no retorno, o campo
   * nunca era exigido e o veterinário entrava sem registro.
   */
  async listRoles(ctx: RequestContext): Promise<RoleSummary[]> {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query<{
        id: string;
        key: string;
        name: string;
        description: string | null;
        requires_license: boolean;
        is_system: boolean;
        permission_count: number;
      }>(
        `SELECT r.id, r.key, r.name, r.description, r.requires_license, r.is_system,
                (SELECT count(*)::int FROM iam.role_permissions rp WHERE rp.role_id = r.id) AS permission_count
           FROM iam.roles r
          WHERE r.tenant_id IS NULL OR r.tenant_id = $1
          ORDER BY r.sort, r.name`,
        [ctx.tenantId],
      );
      return rows.map((r) => ({
        id: r.id,
        key: r.key,
        name: r.name,
        description: r.description,
        requiresLicense: r.requires_license,
        isSystem: r.is_system,
        permissionCount: r.permission_count,
      }));
    });
  }
}
