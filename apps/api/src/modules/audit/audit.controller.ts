import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { AuditQueryService } from './audit-query.service';
import { Authorize } from '../../auth/authorize.decorator';
import { AppError } from '../../common/errors';
import type { AuthedRequest } from '../../common/request-context';

function ctxOf(req: AuthedRequest) {
  if (!req.ctx) throw AppError.unauthenticated();
  return req.ctx;
}

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditQueryService) {}

  @Get()
  @Authorize('core', 'audit:read')
  list(
    @Req() req: AuthedRequest,
    @Query('entityTable') entityTable?: string,
    @Query('entityId') entityId?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('category') category?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.audit.listAudit(ctxOf(req), {
      entityTable,
      entityId,
      actorUserId,
      category,
      action,
      from,
      to,
      cursor,
      limit: Math.min(Number(limit ?? 50) || 50, 200),
    });
  }

  @Get('access')
  @Authorize('core', 'audit:read')
  access(
    @Req() req: AuthedRequest,
    @Query('patientId') patientId?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.audit.listAccess(ctxOf(req), {
      patientId,
      actorUserId,
      from,
      to,
      limit: Math.min(Number(limit ?? 50) || 50, 200),
    });
  }

  @Get('entity/:table/:id')
  @Authorize('core', 'audit:read')
  history(@Req() req: AuthedRequest, @Param('table') table: string, @Param('id') id: string) {
    if (!/^[a-z_]{3,40}$/.test(table)) throw AppError.validation('Tabela inválida.');
    return this.audit.entityHistory(ctxOf(req), table, id);
  }
}
