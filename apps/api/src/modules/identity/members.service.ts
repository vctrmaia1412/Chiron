import { Injectable } from '@nestjs/common';
import type { InviteMemberRequest, Member } from '@chiron/contracts';
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

  async invite(ctx: RequestContext, input: InviteMemberRequest): Promise<{ id: string; token: string }> {
    // Sem esta barreira, quem tem member:invite convida uma segunda conta como
    // proprietário e ganha acesso total à organização.
    if (input.roleKey === OWNER_ROLE_KEY && !ctx.isOwner) {
      throw AppError.forbidden('Somente o proprietário pode conceder o papel de proprietário.');
    }

    const created = await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const role = await tx.query<{ id: string }>(
        `SELECT id FROM iam.roles WHERE key = $1 AND (tenant_id = $2 OR tenant_id IS NULL) ORDER BY tenant_id NULLS LAST LIMIT 1`,
        [input.roleKey, ctx.tenantId],
      );
      const roleId = role.rows[0]?.id;
      if (!roleId) throw AppError.validation('Papel desconhecido.');

      const existing = await tx.query(
        `SELECT 1 FROM iam.memberships m JOIN iam.users u ON u.id = m.user_id
          WHERE m.tenant_id = $1 AND u.email = $2`,
        [ctx.tenantId, input.email],
      );
      if ((existing.rowCount ?? 0) > 0) throw AppError.conflict('Este e-mail já faz parte da organização.');

      // O nome da organização vai no e-mail: quem recebe precisa saber quem
      // está convidando antes de digitar uma senha.
      const tenant = await tx.query<{ name: string }>(`SELECT name FROM platform.tenants WHERE id = $1`, [
        ctx.tenantId,
      ]);

      const token = this.crypto.randomToken();
      const id = uuidv7();

      await tx.query(
        `INSERT INTO iam.invitations
           (id, tenant_id, email, name, role_id, facility_ids, all_facilities, professional, token_hash, invited_by, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now() + interval '14 days')
         ON CONFLICT (tenant_id, email) WHERE accepted_at IS NULL
         DO UPDATE SET role_id = EXCLUDED.role_id, token_hash = EXCLUDED.token_hash,
                       expires_at = EXCLUDED.expires_at, professional = EXCLUDED.professional`,
        [
          id,
          ctx.tenantId,
          input.email,
          input.name ?? null,
          roleId,
          input.facilityIds,
          input.allFacilities,
          input.professional ? JSON.stringify(input.professional) : null,
          this.crypto.tokenHash(token),
          ctx.user.id,
        ],
      );

      await this.audit.record(tx, ctx, {
        category: 'authz_change',
        action: 'member.invite',
        entitySchema: 'iam',
        entityTable: 'invitations',
        entityId: id,
        after: { roleKey: input.roleKey },
      });

      return { id, token, organizationName: tenant.rows[0]?.name ?? 'sua organização' };
    });

    // Fora da transação de propósito: a chamada HTTP ao provedor não pode
    // segurar a conexão do banco. Se o envio falhar, o erro sobe: o convite
    // existe mas ninguém recebeu o link, e reenviar regrava o token.
    await this.mailer.sendInvitation({
      to: input.email,
      recipientName: input.name ?? null,
      organizationName: created.organizationName,
      url: invitationUrl(created.token),
    });

    return { id: created.id, token: created.token };
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

  async listRoles(ctx: RequestContext) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query<{ key: string; name: string; description: string | null; permissions: string[] }>(
        `SELECT r.key, r.name, r.description,
                COALESCE((SELECT array_agg(rp.permission_key ORDER BY rp.permission_key)
                            FROM iam.role_permissions rp WHERE rp.role_id = r.id), '{}') AS permissions
           FROM iam.roles r
          WHERE r.tenant_id IS NULL OR r.tenant_id = $1
          ORDER BY r.sort, r.name`,
        [ctx.tenantId],
      );
      return rows;
    });
  }
}
