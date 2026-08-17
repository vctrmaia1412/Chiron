import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  MODULES,
  PLAN_BY_KEY,
  type LoginRequest,
  type LoginResponse,
  type MeContext,
  type ModuleKey,
  type TenantSummary,
} from '@chiron/contracts';
import { DatabaseService } from '../../database/database.service';
import { SessionService } from '../../auth/session.service';
import { AuditService } from '../../common/audit.service';
import { AppError } from '../../common/errors';
import type { ModuleState, RequestContext } from '../../common/request-context';
import { uuidv7 } from '../../common/uuid';
import { CryptoService } from '../../common/crypto.service';
import { MailerService, passwordResetUrl } from '../../common/mailer.service';
import { logger } from '../../common/logger';
import { env } from '../../config/env';

const MAX_FAILED_ATTEMPTS = 8;
const LOCK_MINUTES = 15;

interface InvitationRow {
  id: string;
  tenant_id: string;
  email: string;
  name: string | null;
  role_id: string;
  facility_ids: string[];
  all_facilities: boolean;
  professional: { council?: string; councilNumber?: string; councilState?: string; specialties?: string[] } | null;
}

/**
 * Desfecho do aceite de convite. A verificação de senha acontece dentro da
 * transação, mas a punição da tentativa errada precisa sobreviver a ela: por
 * isso o caminho de falha volta como valor em vez de exceção.
 */
type AcceptOutcome =
  | { kind: 'invalid_invitation' }
  | { kind: 'password_required' }
  | { kind: 'password_rejected' }
  | { kind: 'password_failed'; userId: string; attempts: number; tenantId: string; invitationId: string }
  | { kind: 'accepted'; invitation: InvitationRow; userId: string; existingAccount: boolean };

/** Evento de autenticação para `audit.audit_log` (categoria `auth`). */
interface AuthEvent {
  action: string;
  userId: string;
  tenantId?: string | null;
  membershipId?: string | null;
  entityTable?: string;
  entityId?: string;
  after?: Record<string, unknown>;
  requestId: string;
  ip: string | null;
  userAgent: string | null;
}

@Injectable()
export class IdentityService {
  constructor(
    private readonly db: DatabaseService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly crypto: CryptoService,
    private readonly mailer: MailerService,
  ) {}

  async login(
    input: LoginRequest,
    meta: { ip: string | null; userAgent: string | null; requestId: string },
  ): Promise<{ response: LoginResponse; token: string; expiresAt: Date }> {
    const userResult = await this.db.iam.query<{
      id: string;
      name: string;
      email: string;
      password_hash: string | null;
      status: string;
      locked_until: Date | null;
      failed_login_attempts: number;
      is_platform_staff: boolean;
    }>(
      `SELECT id, name, email, password_hash, status, locked_until, failed_login_attempts, is_platform_staff
         FROM iam.users WHERE email = $1 AND deleted_at IS NULL`,
      [input.email],
    );

    const user = userResult.rows[0];
    // Resposta uniforme: não revela se o e-mail existe.
    const invalid = new AppError('INVALID_CREDENTIALS', 'E-mail ou senha incorretos.');
    if (!user || !user.password_hash) throw invalid;

    if (user.locked_until && user.locked_until.getTime() > Date.now()) {
      throw new AppError('ACCOUNT_LOCKED', 'Conta temporariamente bloqueada por tentativas de acesso.');
    }
    if (user.status !== 'active') throw invalid;

    const ok = await this.sessions.verifyPassword(user.password_hash, input.password);
    if (!ok) {
      const failure = await this.registerFailedPassword(user.id, user.failed_login_attempts);
      // Sem organização escolhida ainda: o evento vai sem tenant.
      await this.recordAuthEvent({
        action: 'login.failed',
        userId: user.id,
        after: failure,
        requestId: meta.requestId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw invalid;
    }

    await this.db.iam.query(
      `UPDATE iam.users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = now() WHERE id = $1`,
      [user.id],
    );

    const tenants = await this.listUserTenants(user.id);
    let activeTenantId: string | null = null;
    let membershipId: string | null = null;
    let facilityId: string | null = null;

    const requested = input.tenantId ? tenants.find((t) => t.id === input.tenantId) : undefined;
    const chosen = requested ?? (tenants.length === 1 ? tenants[0] : undefined);

    if (chosen) {
      activeTenantId = chosen.id;
      const membership = await this.db.withIam(
        { tenantId: chosen.id, userId: user.id },
        async (tx) =>
          tx.query<{ id: string; default_facility_id: string | null }>(
            `SELECT id, default_facility_id FROM iam.memberships
              WHERE tenant_id = $1 AND user_id = $2 AND status = 'active'`,
            [chosen.id, user.id],
          ),
      );
      membershipId = membership.rows[0]?.id ?? null;
      facilityId = membership.rows[0]?.default_facility_id ?? chosen.facilities[0]?.id ?? null;
    }

    const session = await this.sessions.create({
      userId: user.id,
      tenantId: activeTenantId,
      membershipId,
      facilityId,
      principalType: 'staff',
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    if (activeTenantId && membershipId) {
      await this.db.withTenant(
        { tenantId: activeTenantId, userId: user.id, membershipId, requestId: meta.requestId, ip: meta.ip },
        async (tx) => {
          await tx.query(
            `INSERT INTO audit.audit_log (id, tenant_id, actor_user_id, actor_membership_id, actor_type, category, action, request_id, ip, user_agent)
             VALUES ($1,$2,$3,$4,'user','auth','login',$5,$6,$7)`,
            [uuidv7(), activeTenantId, user.id, membershipId, meta.requestId, meta.ip, meta.userAgent],
          );
        },
      );
    }

    return {
      response: {
        user: { id: user.id, name: user.name, email: user.email },
        token: input.client === 'native' ? session.token : undefined,
        availableTenants: tenants,
        activeTenantId,
      },
      token: session.token,
      expiresAt: session.expiresAt,
    };
  }

  /**
   * Organizações do usuário. Roda com `app.user_id` definido: a política de
   * `iam.memberships` e `platform.tenants` (família tenant_user) libera as
   * linhas do próprio usuário mesmo sem tenant ativo. Sem esse contexto o RLS
   * devolveria zero linhas, que é o comportamento correto de fail closed.
   */
  async listUserTenants(userId: string): Promise<TenantSummary[]> {
    const rows = await this.db.withIam({ tenantId: null, userId }, async (tx) => {
      const result = await tx.query<{
        id: string;
        name: string;
        slug: string;
        status: string;
        facilities: Array<{ id: string; name: string; kind: string }> | null;
      }>(
        `SELECT t.id, t.name, t.slug, t.status,
                COALESCE(
                  (SELECT json_agg(json_build_object('id', f.id, 'name', f.name, 'kind', f.kind) ORDER BY f.name)
                     FROM platform.facilities f
                    WHERE f.tenant_id = t.id AND f.deleted_at IS NULL),
                  '[]'::json
                ) AS facilities
           FROM platform.tenants t
           JOIN iam.memberships m ON m.tenant_id = t.id
          WHERE m.user_id = $1 AND m.status = 'active' AND t.status <> 'closed'
          ORDER BY t.name`,
        [userId],
      );
      return result.rows;
    });

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      status: r.status as TenantSummary['status'],
      facilities: (r.facilities ?? []).map((f) => ({
        id: f.id,
        name: f.name,
        kind: f.kind as TenantSummary['facilities'][number]['kind'],
      })),
    }));
  }

  async meContext(ctx: RequestContext): Promise<MeContext> {
    const tenants = await this.listUserTenants(ctx.user.id);

    if (!ctx.tenantId || !ctx.membershipId) {
      return {
        user: {
          id: ctx.user.id,
          name: ctx.user.name,
          email: ctx.user.email,
          mfaEnabled: ctx.user.mfaEnabled,
          isPlatformStaff: ctx.user.isPlatformStaff,
        },
        principalType: ctx.principalType,
        tenant: null,
        facility: null,
        membership: null,
        availableTenants: tenants,
        facilities: [],
        modules: {} as Record<ModuleKey, ModuleState>,
        permissions: [],
        limits: {},
        permVersion: { tenant: 0, membership: 0 },
        authTime: ctx.authTime.toISOString(),
      };
    }

    return this.db.withTenant(
      {
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        membershipId: ctx.membershipId,
        requestId: ctx.requestId,
      },
      async (tx) => {
        const tenant = await tx.query<{
          id: string;
          name: string;
          slug: string;
          status: string;
          timezone: string;
          settings: Record<string, unknown>;
          perm_version: number;
          plan_key: string | null;
          plan_limits: Record<string, number> | null;
        }>(
          `SELECT t.id, t.name, t.slug, t.status, t.timezone, t.settings, t.perm_version,
                  p.key AS plan_key, p.limits AS plan_limits
             FROM platform.tenants t
             LEFT JOIN platform.plans p ON p.id = t.plan_id
            WHERE t.id = $1`,
          [ctx.tenantId],
        );

        const facilities = await tx.query<{ id: string; name: string; kind: string }>(
          `SELECT id, name, kind FROM platform.facilities
            WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY is_default DESC, name`,
          [ctx.tenantId],
        );

        const membership = await tx.query<{
          id: string;
          status: string;
          is_owner: boolean;
          professional_id: string | null;
          all_facilities: boolean;
          perm_version: number;
        }>(`SELECT id, status, is_owner, professional_id, all_facilities, perm_version FROM iam.memberships WHERE id = $1`, [
          ctx.membershipId,
        ]);

        const roles = await tx.query<{ key: string; name: string }>(
          `SELECT r.key, r.name FROM iam.membership_roles mr
             JOIN iam.roles r ON r.id = mr.role_id
            WHERE mr.membership_id = $1 ORDER BY r.sort`,
          [ctx.membershipId],
        );

        const t = tenant.rows[0];
        const m = membership.rows[0];
        if (!t || !m) throw AppError.unauthenticated();

        const activeFacility = facilities.rows.find((f) => f.id === ctx.facilityId) ?? facilities.rows[0] ?? null;

        const modules: Record<string, ModuleState> = {};
        for (const mod of MODULES) {
          modules[mod.key] = mod.alwaysOn ? 'active' : (ctx.entitlements.get(mod.key) ?? 'disabled');
        }

        const planLimits = t.plan_limits ?? PLAN_BY_KEY[t.plan_key ?? '']?.limits ?? {};

        return {
          user: {
            id: ctx.user.id,
            name: ctx.user.name,
            email: ctx.user.email,
            mfaEnabled: ctx.user.mfaEnabled,
            isPlatformStaff: ctx.user.isPlatformStaff,
          },
          principalType: ctx.principalType,
          tenant: {
            id: t.id,
            name: t.name,
            slug: t.slug,
            status: t.status as MeContext['tenant'] extends null ? never : 'active',
            planKey: t.plan_key ?? 'mvp',
            timezone: t.timezone,
            settings: t.settings ?? {},
          },
          facility: activeFacility
            ? { id: activeFacility.id, name: activeFacility.name, kind: activeFacility.kind as 'clinic' }
            : null,
          membership: {
            id: m.id,
            status: m.status as 'active',
            isOwner: m.is_owner,
            roles: roles.rows,
            professionalId: m.professional_id,
            isLicensed: ctx.isLicensed,
            allFacilities: m.all_facilities,
            facilityIds: ctx.facilityIds,
          },
          availableTenants: tenants,
          facilities: facilities.rows.map((f) => ({ id: f.id, name: f.name, kind: f.kind as 'clinic' })),
          modules: modules as Record<ModuleKey, ModuleState>,
          permissions: [...ctx.permissions].sort(),
          limits: planLimits as Record<string, number>,
          permVersion: { tenant: t.perm_version, membership: m.perm_version },
          authTime: ctx.authTime.toISOString(),
        } satisfies MeContext;
      },
    );
  }

  /** Troca de organização/unidade: valida membership e rotaciona a sessão. */
  async switchContext(
    ctx: RequestContext,
    input: { tenantId?: string; facilityId?: string | null },
  ): Promise<{ token: string; expiresAt: Date }> {
    const targetTenantId = input.tenantId ?? ctx.tenantId;
    if (!targetTenantId) throw AppError.validation('Informe a organização.');

    const membership = await this.db.withIam(
      { tenantId: targetTenantId, userId: ctx.user.id },
      async (tx) =>
        tx.query<{ id: string; default_facility_id: string | null; all_facilities: boolean }>(
          `SELECT id, default_facility_id, all_facilities FROM iam.memberships
            WHERE tenant_id = $1 AND user_id = $2 AND status = 'active'`,
          [targetTenantId, ctx.user.id],
        ),
    );
    const m = membership.rows[0];
    if (!m) throw AppError.forbidden('Você não participa desta organização.');

    let facilityId = input.facilityId ?? (input.tenantId ? m.default_facility_id : ctx.facilityId);

    if (facilityId) {
      const allowed = await this.db.withTenant(
        { tenantId: targetTenantId, userId: ctx.user.id, membershipId: m.id, requestId: ctx.requestId },
        async (tx) => {
          const facility = await tx.query(
            `SELECT 1 FROM platform.facilities WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
            [facilityId, targetTenantId],
          );
          if (facility.rowCount === 0) return false;
          if (m.all_facilities) return true;
          const scoped = await tx.query(
            `SELECT 1 FROM iam.membership_facilities WHERE membership_id = $1 AND facility_id = $2`,
            [m.id, facilityId],
          );
          return (scoped.rowCount ?? 0) > 0;
        },
      );
      if (!allowed) throw AppError.forbidden('Unidade fora do seu escopo de acesso.');
    } else {
      facilityId = m.default_facility_id;
    }

    const rotated = await this.sessions.switchContext({
      sessionId: ctx.sessionId,
      userId: ctx.user.id,
      tenantId: targetTenantId,
      membershipId: m.id,
      facilityId: facilityId ?? null,
    });

    await this.db.withTenant(
      { tenantId: targetTenantId, userId: ctx.user.id, membershipId: m.id, requestId: ctx.requestId, ip: ctx.ip },
      async (tx) => {
        await this.audit.record(tx, { ...ctx, tenantId: targetTenantId, membershipId: m.id }, {
          category: 'context_switch',
          action: 'switch_context',
          entitySchema: 'platform',
          entityTable: 'tenants',
          entityId: targetTenantId,
          after: { facilityId },
        });
      },
    );

    return { token: rotated.token, expiresAt: rotated.expiresAt };
  }

  async logout(ctx: RequestContext): Promise<void> {
    await this.sessions.revoke(ctx.sessionId);
    await this.recordAuthEvent({
      action: 'logout',
      userId: ctx.user.id,
      tenantId: ctx.tenantId,
      membershipId: ctx.membershipId,
      requestId: ctx.requestId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  }

  async listSessions(ctx: RequestContext) {
    const { rows } = await this.db.iam.query<{
      id: string;
      ip: string | null;
      user_agent: string | null;
      created_at: Date;
      last_seen_at: Date;
      expires_at: Date;
    }>(
      `SELECT id, ip, user_agent, created_at, last_seen_at, expires_at
         FROM iam.sessions
        WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
        ORDER BY last_seen_at DESC`,
      [ctx.user.id],
    );
    return rows.map((r) => ({
      id: r.id,
      current: r.id === ctx.sessionId,
      ip: r.ip,
      userAgent: r.user_agent,
      createdAt: r.created_at.toISOString(),
      lastSeenAt: r.last_seen_at.toISOString(),
      expiresAt: r.expires_at.toISOString(),
    }));
  }

  async revokeSession(ctx: RequestContext, sessionId: string): Promise<void> {
    const { rowCount } = await this.db.iam.query(
      `UPDATE iam.sessions SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
      [sessionId, ctx.user.id],
    );
    if (!rowCount) throw AppError.notFound('Sessão');

    await this.recordAuthEvent({
      action: 'session.revoke',
      userId: ctx.user.id,
      tenantId: ctx.tenantId,
      membershipId: ctx.membershipId,
      after: { sessionId, current: sessionId === ctx.sessionId },
      requestId: ctx.requestId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  }

  /**
   * Reautenticação para ações sensíveis. Segue a mesma política do login:
   * conta bloqueada não passa, erro conta tentativa e vira registro de
   * auditoria. Sem isso o endpoint seria um oráculo de senha para quem já
   * tem um cookie de sessão válido.
   */
  async stepUp(ctx: RequestContext, password: string): Promise<void> {
    const { rows } = await this.db.iam.query<{
      id: string;
      password_hash: string | null;
      status: string;
      locked_until: Date | null;
      failed_login_attempts: number;
    }>(
      `SELECT id, password_hash, status, locked_until, failed_login_attempts
         FROM iam.users WHERE id = $1 AND deleted_at IS NULL`,
      [ctx.user.id],
    );

    const user = rows[0];
    const invalid = new AppError('INVALID_CREDENTIALS', 'Senha incorreta.');
    if (!user || !user.password_hash) throw invalid;

    if (user.locked_until && user.locked_until.getTime() > Date.now()) {
      throw new AppError('ACCOUNT_LOCKED', 'Conta temporariamente bloqueada por tentativas de acesso.');
    }
    if (user.status !== 'active') throw invalid;

    const ok = await this.sessions.verifyPassword(user.password_hash, password);
    if (!ok) {
      const failure = await this.registerFailedPassword(user.id, user.failed_login_attempts);
      await this.recordAuthEvent({
        action: 'step_up.failed',
        userId: user.id,
        tenantId: ctx.tenantId,
        membershipId: ctx.membershipId,
        after: failure,
        requestId: ctx.requestId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      throw invalid;
    }

    await this.db.iam.query(
      `UPDATE iam.users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1`,
      [user.id],
    );
    await this.sessions.markStepUp(ctx.sessionId);
  }

  async requestPasswordReset(email: string): Promise<{ token: string | null }> {
    const { rows } = await this.db.iam.query<{ id: string; name: string }>(
      `SELECT id, name FROM iam.users WHERE email = $1 AND status = 'active' AND deleted_at IS NULL`,
      [email],
    );
    const user = rows[0];
    if (!user) return { token: null };

    const token = this.crypto.randomToken();
    await this.db.iam.query(
      `INSERT INTO iam.password_reset_tokens (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, now() + interval '30 minutes')`,
      [uuidv7(), user.id, this.crypto.tokenHash(token)],
    );

    // A rota devolve a mesma resposta para e-mail cadastrado e não cadastrado.
    // Deixar a falha de envio subir quebraria essa simetria: só quem tem conta
    // receberia erro, e isso vira um oráculo de existência. O problema fica no
    // log, com o id do usuário e sem endereço nenhum.
    try {
      await this.mailer.sendPasswordReset({
        to: email,
        recipientName: user.name,
        url: passwordResetUrl(token),
      });
    } catch (error) {
      logger.error({ err: error, userId: user.id }, 'Falha ao enviar o e-mail de redefinição de senha');
    }

    return { token };
  }

  async resetPassword(
    token: string,
    password: string,
    meta: { ip: string | null; userAgent: string | null; requestId: string },
  ): Promise<void> {
    const hash = this.crypto.tokenHash(token);

    const result = await this.db.withIam({ tenantId: null }, async (tx) => {
      const { rows } = await tx.query<{ id: string; user_id: string }>(
        `SELECT id, user_id FROM iam.password_reset_tokens
          WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() FOR UPDATE`,
        [hash],
      );
      const row = rows[0];
      if (!row) return null;

      // O argon2id vem depois da conferência do token, não antes: quem chuta
      // token em série receberia trabalho de CPU de graça em cada tentativa.
      const passwordHash = await this.sessions.hashPassword(password);

      await tx.query(`UPDATE iam.password_reset_tokens SET used_at = now() WHERE id = $1`, [row.id]);
      await tx.query(
        `UPDATE iam.users SET password_hash = $2, failed_login_attempts = 0, locked_until = NULL WHERE id = $1`,
        [row.user_id, passwordHash],
      );
      const revoked = await tx.query(
        `UPDATE iam.sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
        [row.user_id],
      );
      return { userId: row.user_id, sessionsRevoked: revoked.rowCount ?? 0 };
    });

    if (!result) throw AppError.validation('Link inválido ou expirado. Solicite um novo.');

    // A troca de senha derruba todas as sessões: o número delas é o que a
    // investigação precisa para reconstruir o que caiu junto.
    await this.recordAuthEvent({
      action: 'password.reset',
      userId: result.userId,
      after: { sessionsRevoked: result.sessionsRevoked },
      requestId: meta.requestId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  async acceptInvitation(
    token: string,
    payload: { name?: string; password?: string },
    meta: { ip: string | null; userAgent: string | null; requestId: string },
  ): Promise<{ token: string; expiresAt: Date; tenantId: string }> {
    const tokenHash = this.crypto.tokenHash(token);

    /**
     * Mensagem única para senha ausente, senha errada e conta indisponível: o
     * aceite não pode virar um oráculo que diz se o e-mail já tem conta.
     */
    const invalidPassword = new AppError(
      'INVALID_CREDENTIALS',
      'Informe a senha para concluir o convite. Se este e-mail já tem acesso, use a senha atual da conta.',
    );

    const outcome = await this.db.withIam<AcceptOutcome>(
      { tenantId: null, invitationTokenHash: tokenHash },
      async (tx: PoolClient) => {
        const { rows } = await tx.query<InvitationRow>(
          `SELECT id, tenant_id, email, name, role_id, facility_ids, all_facilities, professional
             FROM iam.invitations
            WHERE token_hash = $1 AND accepted_at IS NULL AND expires_at > now()
            FOR UPDATE`,
          [tokenHash],
        );
        const invitation = rows[0];
        if (!invitation) return { kind: 'invalid_invitation' };

        const existing = await tx.query<{
          id: string;
          password_hash: string | null;
          status: string;
          locked_until: Date | null;
          failed_login_attempts: number;
          deleted_at: Date | null;
        }>(
          `SELECT id, password_hash, status, locked_until, failed_login_attempts, deleted_at
             FROM iam.users WHERE email = $1`,
          [invitation.email],
        );
        const user = existing.rows[0];

        // A senha é exigida nos três casos (conta nova, conta sem senha e conta
        // existente), para que a ausência dela não denuncie qual é o caso.
        if (!payload.password) return { kind: 'password_required' };

        let userId: string;
        let existingAccount = false;

        if (!user) {
          userId = uuidv7();
          await tx.query(
            `INSERT INTO iam.users (id, email, name, password_hash, status)
             VALUES ($1, $2, $3, $4, 'active')`,
            [
              userId,
              invitation.email,
              payload.name ?? invitation.name ?? invitation.email.split('@')[0],
              await this.sessions.hashPassword(payload.password),
            ],
          );
        } else if (user.password_hash) {
          // Aceitar o convite de um e-mail que já tem conta é agir como aquela
          // pessoa. A senha dela é conferida pelo mesmo caminho do login, com
          // bloqueio e contagem de tentativas, antes de qualquer sessão.
          if (user.deleted_at || user.status !== 'active') return { kind: 'password_rejected' };
          if (user.locked_until && user.locked_until.getTime() > Date.now()) {
            return { kind: 'password_rejected' };
          }
          const ok = await this.sessions.verifyPassword(user.password_hash, payload.password);
          if (!ok) {
            return {
              kind: 'password_failed',
              userId: user.id,
              attempts: user.failed_login_attempts,
              tenantId: invitation.tenant_id,
              invitationId: invitation.id,
            };
          }
          userId = user.id;
          existingAccount = true;
        } else {
          // Conta sem senha (convite anterior não concluído): define agora.
          if (user.deleted_at || user.status !== 'active') return { kind: 'password_rejected' };
          userId = user.id;
          existingAccount = true;
          await tx.query(`UPDATE iam.users SET password_hash = $2 WHERE id = $1`, [
            userId,
            await this.sessions.hashPassword(payload.password),
          ]);
        }

        await tx.query(`UPDATE iam.invitations SET accepted_at = now() WHERE id = $1`, [invitation.id]);

        return { kind: 'accepted', invitation, userId, existingAccount };
      },
    );

    if (outcome.kind === 'invalid_invitation') throw AppError.validation('Convite inválido ou expirado.');
    if (outcome.kind === 'password_required' || outcome.kind === 'password_rejected') throw invalidPassword;
    if (outcome.kind === 'password_failed') {
      const failure = await this.registerFailedPassword(outcome.userId, outcome.attempts);
      await this.recordAuthEvent({
        action: 'invitation.accept.failed',
        userId: outcome.userId,
        tenantId: outcome.tenantId,
        entityTable: 'invitations',
        entityId: outcome.invitationId,
        after: failure,
        requestId: meta.requestId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw invalidPassword;
    }

    const { invitation, userId, existingAccount } = outcome;

    // Criação da membership dentro do contexto do tenant (RLS ativo).
    const membershipId = await this.db.withTenant(
      { tenantId: invitation.tenant_id, userId, requestId: meta.requestId, ip: meta.ip },
      async (tx) => {
        let professionalId: string | null = null;
        if (invitation.professional?.councilNumber) {
          professionalId = uuidv7();
          await tx.query(
            `INSERT INTO registry.professionals
               (id, tenant_id, user_id, name, council, council_number, council_state, specialties)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              professionalId,
              invitation.tenant_id,
              userId,
              payload.name ?? invitation.name ?? invitation.email,
              invitation.professional.council ?? 'CRMV',
              invitation.professional.councilNumber,
              invitation.professional.councilState ?? null,
              invitation.professional.specialties ?? [],
            ],
          );
        }

        const id = uuidv7();
        const defaultFacility = await tx.query<{ id: string }>(
          `SELECT id FROM platform.facilities WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY is_default DESC LIMIT 1`,
          [invitation.tenant_id],
        );

        await tx.query(
          `INSERT INTO iam.memberships
             (id, tenant_id, user_id, status, professional_id, all_facilities, default_facility_id)
           VALUES ($1,$2,$3,'active',$4,$5,$6)
           ON CONFLICT (tenant_id, user_id) DO UPDATE
             SET status = 'active', professional_id = COALESCE(iam.memberships.professional_id, EXCLUDED.professional_id)`,
          [
            id,
            invitation.tenant_id,
            userId,
            professionalId,
            invitation.all_facilities,
            defaultFacility.rows[0]?.id ?? null,
          ],
        );

        const membership = await tx.query<{ id: string }>(
          `SELECT id FROM iam.memberships WHERE tenant_id = $1 AND user_id = $2`,
          [invitation.tenant_id, userId],
        );
        const finalId = membership.rows[0]?.id ?? id;

        await tx.query(
          `INSERT INTO iam.membership_roles (membership_id, role_id, tenant_id)
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [finalId, invitation.role_id, invitation.tenant_id],
        );

        if (!invitation.all_facilities) {
          for (const facilityId of invitation.facility_ids ?? []) {
            await tx.query(
              `INSERT INTO iam.membership_facilities (membership_id, facility_id, tenant_id)
               VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
              [finalId, facilityId, invitation.tenant_id],
            );
          }
        }

        await tx.query(`UPDATE platform.tenants SET perm_version = perm_version + 1 WHERE id = $1`, [
          invitation.tenant_id,
        ]);

        await this.insertAuthEvent(tx, {
          action: 'invitation.accept',
          userId,
          tenantId: invitation.tenant_id,
          membershipId: finalId,
          entityTable: 'invitations',
          entityId: invitation.id,
          after: { membershipId: finalId, existingAccount },
          requestId: meta.requestId,
          ip: meta.ip,
          userAgent: meta.userAgent,
        });

        return finalId;
      },
    );

    const session = await this.sessions.create({
      userId,
      tenantId: invitation.tenant_id,
      membershipId,
      facilityId: null,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return { token: session.token, expiresAt: session.expiresAt, tenantId: invitation.tenant_id };
  }

  /**
   * Política única da tentativa de senha errada, usada pelo login, pelo
   * step-up e pelo aceite de convite. Fora de transação de propósito: o
   * chamador aborta em seguida e a contagem precisa sobreviver ao rollback.
   */
  private async registerFailedPassword(
    userId: string,
    currentAttempts: number,
  ): Promise<{ attempts: number; locked: boolean }> {
    const attempts = currentAttempts + 1;
    const lockUntil = attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null;
    await this.db.iam.query(`UPDATE iam.users SET failed_login_attempts = $2, locked_until = $3 WHERE id = $1`, [
      userId,
      attempts,
      lockUntil,
    ]);
    return { attempts, locked: lockUntil !== null };
  }

  /** Grava o evento na transação em curso. `after` nunca leva dado pessoal. */
  private async insertAuthEvent(tx: PoolClient, event: AuthEvent): Promise<void> {
    await tx.query(
      `INSERT INTO audit.audit_log
         (id, tenant_id, actor_user_id, actor_membership_id, actor_type, category, action,
          entity_schema, entity_table, entity_id, after, request_id, ip, user_agent)
       VALUES ($1,$2,$3,$4,'user','auth',$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        uuidv7(),
        event.tenantId ?? null,
        event.userId,
        event.membershipId ?? null,
        event.action,
        event.entityTable ? 'iam' : null,
        event.entityTable ?? null,
        event.entityId ?? null,
        event.after ? JSON.stringify(event.after) : null,
        event.requestId,
        event.ip,
        event.userAgent,
      ],
    );
  }

  /**
   * Evento de autenticação avulso. Sem organização escolhida a linha vai sem
   * tenant, e nesse caso a política de `audit.audit_log` só aceita a escrita
   * pelo papel administrativo (migração 0003). Falhar ao auditar não muda a
   * resposta da rota: o registro do problema é o que resta.
   */
  private async recordAuthEvent(event: AuthEvent): Promise<void> {
    try {
      if (event.tenantId) {
        await this.db.withTenant(
          {
            tenantId: event.tenantId,
            userId: event.userId,
            membershipId: event.membershipId ?? null,
            requestId: event.requestId,
            ip: event.ip,
            userAgent: event.userAgent,
          },
          (tx) => this.insertAuthEvent(tx, event),
        );
      } else {
        await this.db.withAdmin((tx) => this.insertAuthEvent(tx, event));
      }
    } catch (error) {
      logger.warn({ err: error, action: event.action }, 'Não foi possível registrar o evento de autenticação');
    }
  }

  cookieOptions(expiresAt: Date) {
    const cfg = env();
    return {
      httpOnly: true,
      secure: cfg.COOKIE_SECURE,
      sameSite: 'lax' as const,
      path: '/',
      expires: expiresAt,
    };
  }
}
