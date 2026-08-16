import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import {
  createPrescriptionSchema,
  prescriptionItemInputSchema,
  signPrescriptionSchema,
  type CreatePrescription,
} from '@chiron/contracts';
import { PrescriptionsService } from './prescriptions.service';
import { Authorize } from '../../auth/authorize.decorator';
import { zBody } from '../../common/zod-validation.pipe';
import { AppError } from '../../common/errors';
import type { AuthedRequest } from '../../common/request-context';

function ctxOf(req: AuthedRequest) {
  if (!req.ctx) throw AppError.unauthenticated();
  return req.ctx;
}

const checkAllergiesSchema = z.object({
  patientId: z.string().uuid(),
  items: z.array(prescriptionItemInputSchema).min(1),
});

const cancelSchema = z.object({ reason: z.string().trim().min(3).max(300) });

@Controller('prescriptions')
export class PrescriptionsController {
  constructor(private readonly prescriptions: PrescriptionsService) {}

  @Get()
  @Authorize('clinical', 'prescription:read')
  list(
    @Req() req: AuthedRequest,
    @Query('patientId') patientId?: string,
    @Query('encounterId') encounterId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.prescriptions.list(ctxOf(req), {
      patientId,
      encounterId,
      limit: Math.min(Number(limit ?? 50), 200),
    });
  }

  @Get(':id')
  @Authorize('clinical', 'prescription:read')
  get(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.prescriptions.get(ctxOf(req), id);
  }

  @Post('check-allergies')
  @Authorize('clinical', 'prescription:read')
  checkAllergies(
    @Req() req: AuthedRequest,
    @Body(zBody(checkAllergiesSchema)) body: z.infer<typeof checkAllergiesSchema>,
  ) {
    return this.prescriptions
      .checkAllergies(ctxOf(req), body.patientId, body.items as CreatePrescription['items'])
      .then((matches) => ({ matches }));
  }

  @Post()
  @Authorize('clinical', 'prescription:create')
  create(@Req() req: AuthedRequest, @Body(zBody(createPrescriptionSchema)) body: CreatePrescription) {
    return this.prescriptions.create(ctxOf(req), body);
  }

  @Post(':id/sign')
  @Authorize('clinical', 'prescription:sign')
  sign(@Req() req: AuthedRequest, @Param('id') id: string, @Body(zBody(signPrescriptionSchema)) _body: unknown) {
    void _body;
    return this.prescriptions.sign(ctxOf(req), id);
  }

  @Post(':id/cancel')
  @Authorize('clinical', 'prescription:cancel')
  cancel(@Req() req: AuthedRequest, @Param('id') id: string, @Body(zBody(cancelSchema)) body: { reason: string }) {
    return this.prescriptions.cancel(ctxOf(req), id, body.reason);
  }
}
