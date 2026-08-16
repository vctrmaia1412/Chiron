import type { FastifyRequest } from 'fastify';
import type { ModuleKey } from '@chiron/contracts';

export type ModuleState = 'active' | 'trial' | 'suspended' | 'disabled';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  isPlatformStaff: boolean;
  mfaEnabled: boolean;
}

export interface RequestContext {
  requestId: string;
  principalType: 'staff' | 'platform_staff' | 'integration' | 'guardian_portal';
  sessionId: string;
  user: SessionUser;
  tenantId: string | null;
  membershipId: string | null;
  professionalId: string | null;
  isLicensed: boolean;
  isOwner: boolean;
  facilityId: string | null;
  facilityIds: string[];
  allFacilities: boolean;
  permissions: Set<string>;
  entitlements: Map<ModuleKey, ModuleState>;
  roleKeys: string[];
  authTime: Date;
  onBehalfOf: string | null;
  ip: string | null;
  userAgent: string | null;
}

export interface AuthedRequest extends FastifyRequest {
  ctx?: RequestContext;
  requestId: string;
}

export function contextToTenantContext(ctx: RequestContext) {
  return {
    tenantId: ctx.tenantId,
    userId: ctx.user.id,
    membershipId: ctx.membershipId,
    requestId: ctx.requestId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    onBehalfOf: ctx.onBehalfOf,
  };
}

export function hasPermission(ctx: RequestContext, permission: string): boolean {
  return ctx.permissions.has(permission);
}

/** Escopo de unidades aplicado pelos repositórios. `null` = todas. */
export function facilityScope(ctx: RequestContext): string[] | null {
  if (ctx.allFacilities) return null;
  return ctx.facilityIds;
}
