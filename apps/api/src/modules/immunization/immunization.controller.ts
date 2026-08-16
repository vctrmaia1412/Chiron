import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import {
  createImmunizationSchema,
  createPreventiveTreatmentSchema,
  isoDateSchema,
  type CreateImmunization,
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

const updateSchema = z.object({
  nextDueAt: isoDateSchema.nullish(),
  reactionNotes: z.string().trim().max(1000).nullish(),
  lotNumber: z.string().trim().max(60).nullish(),
});

const cancelSchema = z.object({ reason: z.string().trim().min(3).max(300) });

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
    @Body(zBody(updateSchema)) body: z.infer<typeof updateSchema>,
  ) {
    return this.immunization.updateImmunization(ctxOf(req), id, body);
  }

  @Post(':id/cancel')
  @Authorize('immunization', 'immunization:cancel')
  cancel(@Req() req: AuthedRequest, @Param('id') id: string, @Body(zBody(cancelSchema)) body: { reason: string }) {
    return this.immunization.cancelImmunization(ctxOf(req), id, body.reason);
  }

  @Post('preventives')
  @Authorize('immunization', 'preventive:record')
  preventive(
    @Req() req: AuthedRequest,
    @Body(zBody(createPreventiveTreatmentSchema)) body: z.infer<typeof createPreventiveTreatmentSchema>,
  ) {
    return this.immunization.recordPreventive(ctxOf(req), body);
  }
}
