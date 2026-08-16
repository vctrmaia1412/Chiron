import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import {
  addPatientGuardianSchema,
  createAlertSchema,
  createAllergySchema,
  createPatientSchema,
  listPatientsQuerySchema,
  recordDeathSchema,
  updatePatientSchema,
  type CreatePatient,
  type RecordDeath,
} from '@chiron/contracts';
import { PatientsService } from './patients.service';
import { Authorize } from '../../auth/authorize.decorator';
import { zBody, zQuery } from '../../common/zod-validation.pipe';
import { AppError } from '../../common/errors';
import type { AuthedRequest } from '../../common/request-context';

function ctxOf(req: AuthedRequest) {
  if (!req.ctx) throw AppError.unauthenticated();
  return req.ctx;
}

const recordWeightSchema = z.object({
  value: z.number().positive().max(20000),
  uom: z.enum(['kg', 'g']).default('kg'),
});

const addIdentifierSchema = z.object({
  scheme: z.enum(['microchip', 'ear_tag', 'sisbov', 'leg_band', 'passport', 'registry', 'tattoo', 'license', 'internal']),
  value: z.string().trim().min(1).max(80),
  issuer: z.string().trim().max(80).optional(),
});

@Controller('patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Get()
  @Authorize('core', 'patient:read')
  list(
    @Req() req: AuthedRequest,
    @Query(zQuery(listPatientsQuerySchema)) query: Record<string, never> & { limit: number },
  ) {
    return this.patients.list(ctxOf(req), query as never);
  }

  @Get(':id')
  @Authorize('core', 'patient:read')
  get(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.patients.get(ctxOf(req), id);
  }

  @Post()
  @Authorize('core', 'patient:create')
  create(@Req() req: AuthedRequest, @Body(zBody(createPatientSchema)) body: CreatePatient) {
    return this.patients.create(ctxOf(req), body);
  }

  @Patch(':id')
  @Authorize('core', 'patient:update')
  update(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(zBody(updatePatientSchema)) body: Record<string, unknown>,
  ) {
    return this.patients.update(ctxOf(req), id, body);
  }

  @Delete(':id')
  @Authorize('core', 'patient:delete')
  async remove(@Req() req: AuthedRequest, @Param('id') id: string) {
    await this.patients.softDelete(ctxOf(req), id);
    return { ok: true };
  }

  @Post(':id/guardians')
  @Authorize('core', 'patient:update')
  async addGuardian(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(zBody(addPatientGuardianSchema)) body: { guardianId: string; role: string; isPrimary: boolean },
  ) {
    await this.patients.addGuardian(ctxOf(req), id, body);
    return { ok: true };
  }

  @Delete(':id/guardians/:guardianId')
  @Authorize('core', 'patient:update')
  async removeGuardian(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Param('guardianId') guardianId: string,
  ) {
    await this.patients.removeGuardian(ctxOf(req), id, guardianId);
    return { ok: true };
  }

  @Post(':id/identifiers')
  @Authorize('core', 'patient:update')
  addIdentifier(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(zBody(addIdentifierSchema)) body: z.infer<typeof addIdentifierSchema>,
  ) {
    return this.patients.addIdentifier(ctxOf(req), id, body);
  }

  @Post(':id/allergies')
  @Authorize('core', 'patient:update')
  addAllergy(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(zBody(createAllergySchema)) body: { substance: string; reaction?: string; severity: string },
  ) {
    return this.patients.addAllergy(ctxOf(req), id, body);
  }

  @Post(':id/alerts')
  @Authorize('core', 'patient:update')
  addAlert(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(zBody(createAlertSchema)) body: { kind: string; message: string },
  ) {
    return this.patients.addAlert(ctxOf(req), id, body);
  }

  /** Pesagem avulsa: recepção pode registrar sem abrir atendimento. */
  @Post(':id/observations/weight')
  @Authorize('clinical', 'observation:record_basic')
  recordWeight(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(zBody(recordWeightSchema)) body: z.infer<typeof recordWeightSchema>,
  ) {
    return this.patients.recordWeight(ctxOf(req), id, body.value, body.uom);
  }

  @Get(':id/weights')
  @Authorize('core', 'patient:read')
  async weights(@Req() req: AuthedRequest, @Param('id') id: string) {
    return { items: await this.patients.listWeights(ctxOf(req), id) };
  }

  @Post(':id/deceased')
  @Authorize('clinical', 'death:record')
  recordDeath(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(zBody(recordDeathSchema)) body: RecordDeath,
  ) {
    return this.patients.recordDeath(ctxOf(req), id, body);
  }

  @Get(':id/death')
  @Authorize('clinical', 'encounter:read')
  death(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.patients.getDeath(ctxOf(req), id);
  }
}
