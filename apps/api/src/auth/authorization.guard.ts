import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MODULE_BY_KEY, isReadOnlyPermission, LICENSE_REQUIRED_PERMISSIONS } from '@chiron/contracts';
import { AppError } from '../common/errors';
import { env } from '../config/env';
import { logger } from '../common/logger';
import { AuditService } from '../common/audit.service';
import { DatabaseService } from '../database/database.service';
import { SessionService } from './session.service';
import {
  ALLOW_NO_TENANT_KEY,
  AUTHORIZE_KEY,
  PUBLIC_KEY,
  STEP_UP_KEY,
  type AuthorizeMetadata,
} from './authorize.decorator';
import type { AuthedRequest, RequestContext } from '../common/request-context';
import { contextToTenantContext } from '../common/request-context';

/**
 * Cadeia única de autorização (documento, seção 14.3):
 *   autenticado -> tenant ativo -> entitlement do módulo -> permissão
 *   -> escopo de unidade -> política de recurso (no caso de uso).
 *
 * Nenhuma rota escapa: sem `@Authorize` e sem `@Public`, o acesso é negado.
 * Isso torna "esquecer de declarar" um erro fechado, não aberto.
 */
@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const handler = context.getHandler();
    const controller = context.getClass();

    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [handler, controller]);
    if (isPublic) return true;

    const cfg = env();
    const cookieToken = (request.cookies as Record<string, string> | undefined)?.[cfg.COOKIE_NAME];
    const authHeader = request.headers.authorization;
    const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const token = cookieToken ?? bearer;

    if (!token) throw AppError.unauthenticated('Faça login para continuar.');

    const ctx = await this.sessions.resolveContext(
      token,
      request.requestId,
      (request.ip as string) ?? null,
      (request.headers['user-agent'] as string) ?? null,
    );
    if (!ctx) throw AppError.unauthenticated('Sessão inválida ou expirada.');
    request.ctx = ctx;

    const allowNoTenant = this.reflector.getAllAndOverride<boolean>(ALLOW_NO_TENANT_KEY, [handler, controller]);
    const meta = this.reflector.getAllAndOverride<AuthorizeMetadata>(AUTHORIZE_KEY, [handler, controller]);

    if (!meta) {
      if (allowNoTenant) return true;
      // Falha fechada: rota sem declaração não passa.
      throw AppError.forbidden('Rota sem declaração de autorização.');
    }

    if (!ctx.tenantId) {
      throw new AppError('FORBIDDEN', 'Selecione uma organização para continuar.');
    }

    // ---- confirmação de contexto: protege contra aba antiga após troca de tenant
    const method = request.method.toUpperCase();
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      const headerTenant = request.headers['x-chiron-tenant'];
      if (typeof headerTenant === 'string' && headerTenant && headerTenant !== ctx.tenantId) {
        throw new AppError(
          'CONTEXT_MISMATCH',
          'A organização ativa mudou nesta sessão. Recarregue a página antes de salvar.',
          { expected: ctx.tenantId },
        );
      }
    }

    // ---- entitlement do módulo
    const moduleDef = MODULE_BY_KEY[meta.module];
    const state = ctx.entitlements.get(meta.module) ?? (moduleDef?.alwaysOn ? 'active' : 'disabled');

    if (state === 'disabled') {
      await this.recordDenial(ctx, request, meta, 'module_not_enabled');
      throw new AppError('MODULE_NOT_ENABLED', `O módulo ${moduleDef?.name ?? meta.module} não está habilitado.`, {
        module: meta.module,
      });
    }
    if (state === 'suspended' && !isReadOnlyPermission(meta.permission)) {
      await this.recordDenial(ctx, request, meta, 'module_suspended');
      throw new AppError('MODULE_SUSPENDED', `O módulo ${moduleDef?.name ?? meta.module} está suspenso.`, {
        module: meta.module,
      });
    }

    // ---- permissão
    if (!ctx.permissions.has(meta.permission)) {
      await this.recordDenial(ctx, request, meta, 'missing_permission');
      throw AppError.forbidden('Seu perfil não permite esta ação.', { permission: meta.permission });
    }

    // ---- licença profissional para assinatura clínica
    if ((LICENSE_REQUIRED_PERMISSIONS as readonly string[]).includes(meta.permission) && !ctx.isLicensed) {
      await this.recordDenial(ctx, request, meta, 'license_required');
      throw new AppError(
        'LICENSE_REQUIRED',
        'Esta ação exige um profissional com registro de conselho válido no cadastro.',
        { permission: meta.permission },
      );
    }

    // ---- step-up (reautenticação recente)
    const needsStepUp = this.reflector.getAllAndOverride<boolean>(STEP_UP_KEY, [handler, controller]);
    if (needsStepUp) {
      const maxAgeMs = cfg.STEP_UP_MAX_AGE_MIN * 60_000;
      if (Date.now() - ctx.authTime.getTime() > maxAgeMs) {
        throw new AppError('STEP_UP_REQUIRED', 'Confirme sua senha para continuar.', {
          maxAgeMinutes: cfg.STEP_UP_MAX_AGE_MIN,
        });
      }
    }

    // ---- impersonação somente leitura
    if (ctx.principalType === 'platform_staff' && method !== 'GET' && ctx.onBehalfOf) {
      await this.recordDenial(ctx, request, meta, 'support_read_only');
      throw AppError.forbidden('Acesso de suporte está limitado a leitura.');
    }

    return true;
  }

  /**
   * Toda negativa vira registro de auditoria. Sem isso, a tentativa de acesso
   * indevido some, e é justamente ela que interessa em uma investigação.
   * A falha ao auditar nunca libera o acesso: apenas registra o problema.
   */
  private async recordDenial(
    ctx: RequestContext,
    request: AuthedRequest,
    meta: AuthorizeMetadata,
    reason: string,
  ): Promise<void> {
    if (!ctx.tenantId) return;
    try {
      await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
        await this.audit.record(tx, ctx, {
          category: 'access_denied',
          action: `${request.method.toUpperCase()} ${request.url}`,
          reason,
          after: { module: meta.module, permission: meta.permission },
        });
      });
    } catch (error) {
      logger.warn({ err: error, requestId: ctx.requestId }, 'Não foi possível auditar a negativa de acesso');
    }
  }
}
