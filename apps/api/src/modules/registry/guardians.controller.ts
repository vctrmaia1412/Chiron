import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import {
  createGuardianSchema,
  listGuardiansQuerySchema,
  updateGuardianSchema,
  type CreateGuardian,
} from '@chiron/contracts';
import { GuardiansService } from './guardians.service';
import { Authorize, RequireStepUp } from '../../auth/authorize.decorator';
import { zBody, zQuery } from '../../common/zod-validation.pipe';
import { AppError } from '../../common/errors';
import type { AuthedRequest } from '../../common/request-context';

function ctxOf(req: AuthedRequest) {
  if (!req.ctx) throw AppError.unauthenticated();
  return req.ctx;
}

@Controller('guardians')
export class GuardiansController {
  constructor(private readonly guardians: GuardiansService) {}

  @Get()
  @Authorize('core', 'guardian:read')
  list(
    @Req() req: AuthedRequest,
    @Query(zQuery(listGuardiansQuerySchema)) query: { q?: string; limit: number; cursor?: string },
  ) {
    return this.guardians.list(ctxOf(req), query);
  }

  @Get(':id')
  @Authorize('core', 'guardian:read')
  get(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.guardians.get(ctxOf(req), id);
  }

  @Post()
  @Authorize('core', 'guardian:create')
  create(@Req() req: AuthedRequest, @Body(zBody(createGuardianSchema)) body: CreateGuardian) {
    return this.guardians.create(ctxOf(req), body);
  }

  @Patch(':id')
  @Authorize('core', 'guardian:update')
  update(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(zBody(updateGuardianSchema)) body: Partial<CreateGuardian>,
  ) {
    return this.guardians.update(ctxOf(req), id, body);
  }

  @Delete(':id')
  @Authorize('core', 'guardian:delete')
  async remove(@Req() req: AuthedRequest, @Param('id') id: string) {
    await this.guardians.softDelete(ctxOf(req), id);
    return { ok: true };
  }

  @Get(':id/export')
  @Authorize('core', 'guardian:export')
  exportData(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.guardians.exportData(ctxOf(req), id);
  }

  @Post(':id/anonymize')
  @Authorize('core', 'guardian:anonymize')
  @RequireStepUp()
  async anonymize(@Req() req: AuthedRequest, @Param('id') id: string) {
    await this.guardians.anonymize(ctxOf(req), id);
    return { ok: true };
  }
}
