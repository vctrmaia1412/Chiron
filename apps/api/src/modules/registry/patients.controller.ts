import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import {
  addPatientGuardianSchema,
  addPatientIdentifierSchema,
  createAlertSchema,
  createAllergySchema,
  createPatientSchema,
  inactivatePatientSchema,
  listPatientsQuerySchema,
  recordDeathSchema,
  updateAllergyStatusSchema,
  updatePatientSchema,
  type AddPatientGuardian,
  type AddPatientIdentifier,
  type CreatePatient,
  type InactivatePatient,
  type ListPatientsQuery,
  type RecordDeath,
  type UpdateAllergyStatus,
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

@Controller('patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Get()
  @Authorize('core', 'patient:read')
  list(@Req() req: AuthedRequest, @Query(zQuery(listPatientsQuerySchema)) query: ListPatientsQuery) {
    return this.patients.list(ctxOf(req), query);
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

  /** Inativar é reversível e pede motivo: mesma permissão de editar o cadastro. */
  @Post(':id/inactivate')
  @Authorize('core', 'patient:update')
  inactivate(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(zBody(inactivatePatientSchema)) body: InactivatePatient,
  ) {
    return this.patients.inactivate(ctxOf(req), id, body);
  }

  @Post(':id/reactivate')
  @Authorize('core', 'patient:update')
  reactivate(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.patients.reactivate(ctxOf(req), id);
  }

  @Post(':id/guardians')
  @Authorize('core', 'patient:update')
  addGuardian(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(zBody(addPatientGuardianSchema)) body: AddPatientGuardian,
  ) {
    return this.patients.addGuardian(ctxOf(req), id, body);
  }

  @Post(':id/guardians/:guardianId/primary')
  @Authorize('core', 'patient:update')
  setPrimaryGuardian(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Param('guardianId') guardianId: string,
  ) {
    return this.patients.setPrimaryGuardian(ctxOf(req), id, guardianId);
  }

  @Delete(':id/guardians/:guardianId')
  @Authorize('core', 'patient:update')
  removeGuardian(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Param('guardianId') guardianId: string,
  ) {
    return this.patients.removeGuardian(ctxOf(req), id, guardianId);
  }

  @Post(':id/identifiers')
  @Authorize('core', 'patient:update')
  addIdentifier(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(zBody(addPatientIdentifierSchema)) body: AddPatientIdentifier,
  ) {
    return this.patients.addIdentifier(ctxOf(req), id, body);
  }

  @Delete(':id/identifiers/:identifierId')
  @Authorize('core', 'patient:update')
  async removeIdentifier(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Param('identifierId') identifierId: string,
  ) {
    await this.patients.removeIdentifier(ctxOf(req), id, identifierId);
    return { ok: true };
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

  /**
   * Registrar alergia qualquer um do cadastro pode (errar para o lado seguro);
   * tirar da lista ativa é decisão clínica.
   */
  @Patch(':id/allergies/:allergyId')
  @Authorize('clinical', 'encounter:update')
  updateAllergyStatus(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Param('allergyId') allergyId: string,
    @Body(zBody(updateAllergyStatusSchema)) body: UpdateAllergyStatus,
  ) {
    return this.patients.updateAllergyStatus(ctxOf(req), id, allergyId, body);
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

  @Delete(':id/alerts/:alertId')
  @Authorize('core', 'patient:update')
  async deactivateAlert(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Param('alertId') alertId: string,
  ) {
    await this.patients.deactivateAlert(ctxOf(req), id, alertId);
    return { ok: true };
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
