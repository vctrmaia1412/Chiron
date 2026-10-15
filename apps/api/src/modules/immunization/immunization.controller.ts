import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import {
  cancelImmunizationRecordSchema,
  createImmunizationSchema,
  createPreventiveTreatmentSchema,
  updateImmunizationSchema,
  updatePreventiveTreatmentSchema,
  type CancelImmunizationRecord,
  type CreateImmunization,
  type CreatePreventiveTreatment,
  type UpdateImmunization,
  type UpdatePreventiveTreatment,
} from '@chiron/contracts';
import { ImmunizationService } from './immunization.service';
import { Authorize } from '../../auth/authorize.decorator';
import { zBody } from '../../common/zod-validation.pipe';
import { AppError } from '../../common/errors';
import type { AuthedRequest } from '../../common/request-context';

function ctxOf(req: AuthedRequest) {
  if (!req.ctx) throw AppError.unauthenticated();
  return req.ctx;
}

/**
 * Corrigir e cancelar preventivo usam as mesmas permissões da vacina: o
 * módulo é um só e quem pode desfazer registro clínico é o mesmo papel.
 * `preventive:record` continua só registrando (recepção vende no balcão).
 */
@Controller('immunizations')
export class ImmunizationController {
  constructor(private readonly immunization: ImmunizationService) {}

  @Get()
  @Authorize('immunization', 'immunization:read')
  list(
    @Req() req: AuthedRequest,
    @Query('patientId') patientId?: string,
    @Query('encounterId') encounterId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.immunization.list(ctxOf(req), {
      patientId,
      encounterId,
      limit: Math.min(Number(limit ?? 100) || 100, 300),
    });
  }

  @Get('due')
  @Authorize('immunization', 'immunization:read')
  due(@Req() req: AuthedRequest, @Query('until') until?: string, @Query('limit') limit?: string) {
    return this.immunization.listDue(ctxOf(req), until, Math.min(Number(limit ?? 100) || 100, 500));
  }

  @Post()
  @Authorize('immunization', 'immunization:apply')
  apply(@Req() req: AuthedRequest, @Body(zBody(createImmunizationSchema)) body: CreateImmunization) {
    return this.immunization.apply(ctxOf(req), body);
  }

  @Post('preventives')
  @Authorize('immunization', 'preventive:record')
  preventive(
    @Req() req: AuthedRequest,
    @Body(zBody(createPreventiveTreatmentSchema)) body: CreatePreventiveTreatment,
  ) {
    return this.immunization.recordPreventive(ctxOf(req), body);
  }

  @Get('preventives/:id')
  @Authorize('immunization', 'immunization:read')
  getPreventive(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.immunization.getPreventive(ctxOf(req), id);
  }

  @Patch('preventives/:id')
  @Authorize('immunization', 'immunization:update')
  updatePreventive(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(zBody(updatePreventiveTreatmentSchema)) body: UpdatePreventiveTreatment,
  ) {
    return this.immunization.updatePreventive(ctxOf(req), id, body);
  }

  @Post('preventives/:id/cancel')
  @Authorize('immunization', 'immunization:cancel')
  cancelPreventive(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(zBody(cancelImmunizationRecordSchema)) body: CancelImmunizationRecord,
  ) {
    return this.immunization.cancelPreventive(ctxOf(req), id, body.reason);
  }

  @Get(':id')
  @Authorize('immunization', 'immunization:read')
  get(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.immunization.getImmunization(ctxOf(req), id);
  }

  @Patch(':id')
  @Authorize('immunization', 'immunization:update')
  update(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(zBody(updateImmunizationSchema)) body: UpdateImmunization,
  ) {
    return this.immunization.updateImmunization(ctxOf(req), id, body);
  }

  @Post(':id/cancel')
  @Authorize('immunization', 'immunization:cancel')
  cancel(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(zBody(cancelImmunizationRecordSchema)) body: CancelImmunizationRecord,
  ) {
    return this.immunization.cancelImmunization(ctxOf(req), id, body.reason);
  }
}
