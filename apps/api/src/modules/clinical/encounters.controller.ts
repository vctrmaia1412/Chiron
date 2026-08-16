import { Body, Controller, Delete, Get, Param, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import {
  amendNoteSchema,
  cancelEncounterSchema,
  createDiagnosisSchema,
  createEncounterSchema,
  createProcedureSchema,
  finishEncounterSchema,
  listEncountersQuerySchema,
  listTimelineQuerySchema,
  recordObservationsSchema,
  reopenEncounterSchema,
  upsertNoteSchema,
  type CreateEncounter,
  type FinishEncounter,
  type RecordObservations,
  type UpsertNote,
} from '@chiron/contracts';
import { EncountersService } from './encounters.service';
import { TimelineService } from './timeline.service';
import { Authorize, RequireStepUp } from '../../auth/authorize.decorator';
import { zBody, zQuery } from '../../common/zod-validation.pipe';
import { AppError } from '../../common/errors';
import type { AuthedRequest } from '../../common/request-context';

function ctxOf(req: AuthedRequest) {
  if (!req.ctx) throw AppError.unauthenticated();
  return req.ctx;
}

const triageSchema = z.object({
  note: z.string().trim().max(5000).optional(),
  observations: recordObservationsSchema.shape.items.optional(),
});

@Controller()
export class EncountersController {
  constructor(
    private readonly encounters: EncountersService,
    private readonly timeline: TimelineService,
  ) {}

  @Get('encounters')
  @Authorize('clinical', 'encounter:read')
  list(
    @Req() req: AuthedRequest,
    @Query(zQuery(listEncountersQuerySchema)) query: Record<string, never> & { limit: number },
  ) {
    return this.encounters.list(ctxOf(req), query as never);
  }

  @Get('encounters/:id')
  @Authorize('clinical', 'encounter:read')
  get(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.encounters.get(ctxOf(req), id);
  }

  @Post('encounters')
  @Authorize('clinical', 'encounter:create')
  create(@Req() req: AuthedRequest, @Body(zBody(createEncounterSchema)) body: CreateEncounter) {
    return this.encounters.create(ctxOf(req), body);
  }

  @Post('encounters/:id/triage')
  @Authorize('clinical', 'encounter:update')
  triage(@Req() req: AuthedRequest, @Param('id') id: string, @Body(zBody(triageSchema)) body: z.infer<typeof triageSchema>) {
    return this.encounters.triage(ctxOf(req), id, body);
  }

  @Post('encounters/:id/start')
  @Authorize('clinical', 'encounter:update')
  start(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.encounters.transition(ctxOf(req), id, 'in_progress');
  }

  @Post('encounters/:id/hold')
  @Authorize('clinical', 'encounter:update')
  hold(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.encounters.transition(ctxOf(req), id, 'on_hold');
  }

  @Post('encounters/:id/resume')
  @Authorize('clinical', 'encounter:update')
  resume(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.encounters.transition(ctxOf(req), id, 'in_progress');
  }

  @Post('encounters/:id/cancel')
  @Authorize('clinical', 'encounter:cancel')
  cancel(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(zBody(cancelEncounterSchema)) body: { reason: string },
  ) {
    return this.encounters.transition(ctxOf(req), id, 'cancelled', body.reason);
  }

  @Post('encounters/:id/notes')
  @Authorize('clinical', 'encounter:update')
  upsertNote(@Req() req: AuthedRequest, @Param('id') id: string, @Body(zBody(upsertNoteSchema)) body: UpsertNote) {
    return this.encounters.upsertNote(ctxOf(req), id, body);
  }

  @Post('encounters/:id/notes/:noteId/amend')
  @Authorize('clinical', 'encounter:amend')
  amendNote(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @Body(zBody(amendNoteSchema)) body: { body: string; reason: string },
  ) {
    return this.encounters.amendNote(ctxOf(req), id, noteId, body);
  }

  @Post('encounters/:id/observations')
  @Authorize('clinical', 'encounter:update')
  observations(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(zBody(recordObservationsSchema)) body: RecordObservations,
  ) {
    return this.encounters.recordObservations(ctxOf(req), id, body);
  }

  @Post('encounters/:id/diagnoses')
  @Authorize('clinical', 'encounter:update')
  addDiagnosis(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(zBody(createDiagnosisSchema)) body: Record<string, unknown>,
  ) {
    return this.encounters.addDiagnosis(ctxOf(req), id, body);
  }

  @Delete('encounters/:id/diagnoses/:diagnosisId')
  @Authorize('clinical', 'encounter:update')
  removeDiagnosis(@Req() req: AuthedRequest, @Param('id') id: string, @Param('diagnosisId') diagnosisId: string) {
    return this.encounters.removeDiagnosis(ctxOf(req), id, diagnosisId);
  }

  @Post('encounters/:id/procedures')
  @Authorize('clinical', 'encounter:update')
  addProcedure(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(zBody(createProcedureSchema)) body: Record<string, unknown>,
  ) {
    return this.encounters.addProcedure(ctxOf(req), id, body);
  }

  @Post('encounters/:id/finish')
  @Authorize('clinical', 'encounter:sign')
  finish(@Req() req: AuthedRequest, @Param('id') id: string, @Body(zBody(finishEncounterSchema)) body: FinishEncounter) {
    return this.encounters.finish(ctxOf(req), id, body);
  }

  @Post('encounters/:id/reopen')
  @Authorize('clinical', 'encounter:reopen')
  @RequireStepUp()
  reopen(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(zBody(reopenEncounterSchema)) body: { reason: string },
  ) {
    return this.encounters.reopen(ctxOf(req), id, body.reason);
  }

  @Get('encounters/:id/charges')
  @Authorize('clinical', 'charge:read')
  charges(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.encounters.listCharges(ctxOf(req), id);
  }

  @Post('encounters/:id/charges/settle-externally')
  @Authorize('clinical', 'charge:read')
  settleCharges(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.encounters.settleChargesExternally(ctxOf(req), id);
  }

  // ------------------------------------------------- prontuário e timeline
  @Get('patients/:id/timeline')
  @Authorize('clinical', 'encounter:read')
  patientTimeline(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query(zQuery(listTimelineQuerySchema)) query: { limit: number; cursor?: string; kinds?: string },
  ) {
    return this.timeline.forPatient(ctxOf(req), id, query);
  }

  @Get('patients/:id/record')
  @Authorize('clinical', 'record:read_sensitive')
  medicalRecord(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.timeline.medicalRecord(ctxOf(req), id);
  }
}
