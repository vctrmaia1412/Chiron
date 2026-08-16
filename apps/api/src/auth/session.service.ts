import { Injectable } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { DatabaseService } from '../database/database.service';
import { env } from '../config/env';
import { uuidv7 } from '../common/uuid';
import { AppError } from '../common/errors';
import type { ModuleKey } from '@chiron/contracts';
import type { ModuleState, RequestContext, SessionUser } from '../common/request-context';

interface SessionRow {
  id: string;
  user_id: string;
  principal_type: string;
  active_tenant_id: string | null;
  active_membership_id: string | null;
  active_facility_id: string | null;
  tenant_perm_version: number | null;
  membership_perm_version: number | null;
  auth_time: Date;
  expires_at: Date;
  absolute_expires_at: Date;
  revoked_at: Date | null;
  impersonation_grant_id: string | null;
}

export interface CreateSessionInput {
  userId: string;
  tenantId: string | null;
  membershipId: string | null;
  facilityId: string | null;
  principalType?: 'staff' | 'platform_staff';
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class SessionService {
  constructor(private readonly db: DatabaseService) {}

  /** Id armazenado = HMAC do token opaco; o token cru só existe no cookie. */
  hashToken(token: string): string {
    return createHmac('sha256', env().SESSION_SECRET).update(token).digest('hex');
  }

  generateToken(): string {
    return randomBytes(32).toString('base64url');
  }

  async hashPassword(password: string): Promise<string> {
    return argonHash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  }

  async verifyPassword(hash: string, password: string): Promise<boolean> {
    try {
      return await argonVerify(hash, password);
    } catch {
      return false;
    }
  }

  async create(input: CreateSessionInput): Promise<{ token: string; sessionId: string; expiresAt: Date }> {
    const cfg = env();
    const token = this.generateToken();
    const sessionId = this.hashToken(token);
    const expiresAt = new Date(Date.now() + cfg.SESSION_TTL_HOURS * 3600_000);
    const absoluteExpiresAt = new Date(Date.now() + cfg.SESSION_ABSOLUTE_DAYS * 86_400_000);

    await this.db.withIam({ tenantId: null, userId: input.userId }, async (tx) => {
      const versions = input.tenantId
        ? await tx.query<{ tenant_perm_version: number; membership_perm_version: number | null }>(
            `SELECT t.perm_version AS tenant_perm_version, m.perm_version AS membership_perm_version
               FROM platform.tenants t
               LEFT JOIN iam.memberships m ON m.id = $2
              WHERE t.id = $1`,
            [input.tenantId, input.membershipId],
          )
        : { rows: [] };

      await tx.query(
        `INSERT INTO iam.sessions
           (id, user_id, principal_type, active_tenant_id, active_membership_id, active_facility_id,
            tenant_perm_version, membership_perm_version, auth_time, ip, user_agent, expires_at, absolute_expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), $9, $10, $11, $12)`,
        [
          sessionId,
          input.userId,
          input.principalType ?? 'staff',
          input.tenantId,
          input.membershipId,
          input.facilityId,
          versions.rows[0]?.tenant_perm_version ?? null,
          versions.rows[0]?.membership_perm_version ?? null,
          input.ip ?? null,
          input.userAgent ?? null,
          expiresAt,
          absoluteExpiresAt,
        ],
      );
    });

    return { token, sessionId, expiresAt };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.db.iam.query(`UPDATE iam.sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, [
      sessionId,
    ]);
  }

  async revokeAllForUser(userId: string, exceptSessionId?: string): Promise<void> {
    await this.db.iam.query(
      `UPDATE iam.sessions SET revoked_at = now()
        WHERE user_id = $1 AND revoked_at IS NULL AND ($2::text IS NULL OR id <> $2)`,
      [userId, exceptSessionId ?? null],
    );
  }

  /** Troca o contexto ativo e rotaciona o identificador da sessão. */
  async switchContext(params: {
    sessionId: string;
    userId: string;
    tenantId: string | null;
    membershipId: string | null;
    facilityId: string | null;
  }): Promise<{ token: string; sessionId: string; expiresAt: Date }> {
    const current = await this.db.iam.query<SessionRow>(`SELECT * FROM iam.sessions WHERE id = $1`, [
      params.sessionId,
    ]);
    const row = current.rows[0];
    if (!row) throw AppError.unauthenticated();

    const token = this.generateToken();
    const newId = this.hashToken(token);

    await this.db.withIam({ tenantId: null, userId: params.userId }, async (tx) => {
      const versions = params.tenantId
        ? await tx.query<{ tenant_perm_version: number; membership_perm_version: number | null }>(
            `SELECT t.perm_version AS tenant_perm_version, m.perm_version AS membership_perm_version
               FROM platform.tenants t
               LEFT JOIN iam.memberships m ON m.id = $2
              WHERE t.id = $1`,
            [params.tenantId, params.membershipId],
          )
        : { rows: [] };

      await tx.query(
        `INSERT INTO iam.sessions
           (id, user_id, principal_type, active_tenant_id, active_membership_id, active_facility_id,
            tenant_perm_version, membership_perm_version, auth_time, ip, user_agent, expires_at, absolute_expires_at)
         SELECT $1, user_id, principal_type, $2, $3, $4, $5, $6, auth_time, ip, user_agent, expires_at, absolute_expires_at
           FROM iam.sessions WHERE id = $7`,
        [
          newId,
          params.tenantId,
          params.membershipId,
          params.facilityId,
          versions.rows[0]?.tenant_perm_version ?? null,
          versions.rows[0]?.membership_perm_version ?? null,
          params.sessionId,
        ],
      );
      await tx.query(`UPDATE iam.sessions SET revoked_at = now() WHERE id = $1`, [params.sessionId]);
    });

    return { token, sessionId: newId, expiresAt: row.expires_at };
  }

  async touch(sessionId: string): Promise<void> {
    const cfg = env();
    await this.db.iam.query(
      `UPDATE iam.sessions
          SET last_seen_at = now(),
              expires_at = LEAST(now() + ($2 || ' hours')::interval, absolute_expires_at)
        WHERE id = $1`,
      [sessionId, String(cfg.SESSION_TTL_HOURS)],
    );
  }

  async markStepUp(sessionId: string): Promise<void> {
    await this.db.iam.query(`UPDATE iam.sessions SET auth_time = now() WHERE id = $1`, [sessionId]);
  }

  /**
   * Carrega a sessão e monta o contexto do request: papéis, permissões
   * efetivas (filtradas por entitlement) e escopo de unidades.
   */
  async resolveContext(token: string, requestId: string, ip: string | null, userAgent: string | null): Promise<RequestContext | null> {
    const sessionId = this.hashToken(token);

    const sessionResult = await this.db.iam.query<
      SessionRow & {
        user_name: string;
        user_email: string;
        user_status: string;
        is_platform_staff: boolean;
        mfa_enabled: boolean;
      }
    >(
      `SELECT s.*, u.name AS user_name, u.email AS user_email, u.status AS user_status,
              u.is_platform_staff, u.mfa_enabled
         FROM iam.sessions s
         JOIN iam.users u ON u.id = s.user_id
        WHERE s.id = $1`,
      [sessionId],
    );

    const session = sessionResult.rows[0];
    if (!session) return null;
    if (session.revoked_at) return null;
    if (session.expires_at.getTime() < Date.now()) return null;
    if (session.absolute_expires_at.getTime() < Date.now()) return null;
    if (session.user_status !== 'active') return null;

    const user: SessionUser = {
      id: session.user_id,
      name: session.user_name,
      email: session.user_email,
      isPlatformStaff: session.is_platform_staff,
      mfaEnabled: session.mfa_enabled,
    };

    const base: RequestContext = {
      requestId,
      principalType: (session.principal_type as RequestContext['principalType']) ?? 'staff',
      sessionId,
      user,
      tenantId: null,
      membershipId: null,
      professionalId: null,
      isLicensed: false,
      isOwner: false,
      facilityId: null,
      facilityIds: [],
      allFacilities: false,
      permissions: new Set<string>(),
      entitlements: new Map<ModuleKey, ModuleState>(),
      roleKeys: [],
      authTime: session.auth_time,
      onBehalfOf: session.impersonation_grant_id ? session.user_id : null,
      ip,
      userAgent,
    };

    if (!session.active_tenant_id || !session.active_membership_id) return base;

    const tenantId = session.active_tenant_id;
    const membershipId = session.active_membership_id;

    // Contexto de tenant para respeitar RLS ao ler membership/roles/entitlements.
    const loaded = await this.db.withTenant(
      { tenantId, userId: session.user_id, membershipId, requestId, ip, userAgent },
      async (tx) => {
        const membership = await tx.query<{
          id: string;
          status: string;
          is_owner: boolean;
          professional_id: string | null;
          all_facilities: boolean;
          perm_version: number;
          tenant_status: string;
          tenant_perm_version: number;
          council_number: string | null;
          council_valid_until: Date | null;
        }>(
          `SELECT m.id, m.status, m.is_owner, m.professional_id, m.all_facilities, m.perm_version,
                  t.status AS tenant_status, t.perm_version AS tenant_perm_version,
                  p.council_number, p.council_valid_until
             FROM iam.memberships m
             JOIN platform.tenants t ON t.id = m.tenant_id
             LEFT JOIN registry.professionals p ON p.id = m.professional_id
            WHERE m.id = $1 AND m.tenant_id = $2`,
          [membershipId, tenantId],
        );

        const m = membership.rows[0];
        if (!m || m.status !== 'active') return null;
        if (m.tenant_status === 'closed') return null;

        const roles = await tx.query<{ key: string }>(
          `SELECT r.key FROM iam.membership_roles mr
             JOIN iam.roles r ON r.id = mr.role_id
            WHERE mr.membership_id = $1`,
          [membershipId],
        );

        const perms = await tx.query<{ permission_key: string }>(
          `SELECT DISTINCT rp.permission_key
             FROM iam.membership_roles mr
             JOIN iam.role_permissions rp ON rp.role_id = mr.role_id
            WHERE mr.membership_id = $1`,
          [membershipId],
        );

        const facilities = await tx.query<{ facility_id: string }>(
          `SELECT facility_id FROM iam.membership_facilities WHERE membership_id = $1`,
          [membershipId],
        );

        const entitlements = await tx.query<{ module_key: string; state: string; grace_until: Date | null }>(
          `SELECT module_key, state, grace_until FROM platform.tenant_entitlements WHERE tenant_id = $1`,
          [tenantId],
        );

        return { m, roles: roles.rows, perms: perms.rows, facilities: facilities.rows, entitlements: entitlements.rows };
      },
    );

    if (!loaded) return base;

    const entitlementMap = new Map<ModuleKey, ModuleState>();
    entitlementMap.set('core', 'active');
    for (const e of loaded.entitlements) {
      entitlementMap.set(e.module_key as ModuleKey, e.state as ModuleState);
    }

    const licensed = Boolean(
      loaded.m.council_number &&
        (!loaded.m.council_valid_until || loaded.m.council_valid_until.getTime() >= Date.now()),
    );

    return {
      ...base,
      tenantId,
      membershipId,
      professionalId: loaded.m.professional_id,
      isLicensed: licensed,
      isOwner: loaded.m.is_owner,
      facilityId: session.active_facility_id,
      facilityIds: loaded.facilities.map((f) => f.facility_id),
      allFacilities: loaded.m.all_facilities,
      permissions: new Set(loaded.perms.map((p) => p.permission_key)),
      entitlements: entitlementMap,
      roleKeys: loaded.roles.map((r) => r.key),
    };
  }

  safeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }

  newId(): string {
    return uuidv7();
  }
}
