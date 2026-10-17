import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import {
  createNoteTemplateSchema,
  createPatientProblemSchema,
  createPrescriptionTemplateSchema,
  listNoteTemplatesQuerySchema,
  medicationSuggestionsQuerySchema,
  patientSummaryQuerySchema,
  protocolSuggestionsQuerySchema,
  searchConditionsQuerySchema,
  updatePatientProblemSchema,
  type CreateNoteTemplate,
  type CreatePatientProblem,
  type CreatePrescriptionTemplate,
} from '@chiron/contracts';
import { ChartingService } from './charting.service';
import { Authorize } from '../../auth/authorize.decorator';
import { zBody, zQuery } from '../../common/zod-validation.pipe';
import { AppError } from '../../common/errors';
import type { AuthedRequest } from '../../common/request-context';

function ctxOf(req: AuthedRequest) {
  if (!req.ctx) throw AppError.unauthenticated();
  return req.ctx;
}

const speciesQuerySchema = z.object({ speciesId: z.string().uuid().optional() });

/**
 * Rotas de apoio ao registro rápido. Leitura com a permissão de quem já vê o
 * atendimento; escrita com a de quem já escreve nele. Nenhuma permissão nova:
 * quem atende pode usar e criar seus modelos sem pedir acesso a ninguém.
 */
@Controller()
export class ChartingController {
  constructor(private readonly charting: ChartingService) {}

  @Get('note-templates')
  @Authorize('clinical', 'encounter:read')
  listNoteTemplates(
    @Req() req: AuthedRequest,
    @Query(zQuery(listNoteTemplatesQuerySchema)) query: z.infer<typeof listNoteTemplatesQuerySchema>,
  ) {
    return this.charting.listNoteTemplates(ctxOf(req), query);
  }

  @Post('note-templates')
  @Authorize('clinical', 'encounter:update')
  createNoteTemplate(@Req() req: AuthedRequest, @Body(zBody(createNoteTemplateSchema)) body: CreateNoteTemplate) {
    return this.charting.createNoteTemplate(ctxOf(req), body);
  }

  @Delete('note-templates/:id')
  @Authorize('clinical', 'encounter:update')
  async removeNoteTemplate(@Req() req: AuthedRequest, @Param('id') id: string) {
    await this.charting.removeNoteTemplate(ctxOf(req), id);
    return { ok: true };
  }

  @Get('conditions')
  @Authorize('clinical', 'encounter:read')
  searchConditions(
    @Req() req: AuthedRequest,
    @Query(zQuery(searchConditionsQuerySchema)) query: z.infer<typeof searchConditionsQuerySchema>,
  ) {
    return this.charting.searchConditions(ctxOf(req), query);
  }

  @Get('patients/:id/problems')
  @Authorize('clinical', 'encounter:read')
  listProblems(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.charting.listProblems(ctxOf(req), id);
  }

  @Post('patients/:id/problems')
  @Authorize('clinical', 'encounter:update')
  addProblem(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(zBody(createPatientProblemSchema)) body: CreatePatientProblem,
  ) {
    return this.charting.addProblem(ctxOf(req), id, body);
  }

  @Patch('patients/:id/problems/:problemId')
  @Authorize('clinical', 'encounter:update')
  updateProblem(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Param('problemId') problemId: string,
    @Body(zBody(updatePatientProblemSchema)) body: z.infer<typeof updatePatientProblemSchema>,
  ) {
    return this.charting.updateProblem(ctxOf(req), id, problemId, body.status);
  }

  @Get('patients/:id/clinical-summary')
  @Authorize('clinical', 'encounter:read')
  patientSummary(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query(zQuery(patientSummaryQuerySchema)) query: z.infer<typeof patientSummaryQuerySchema>,
  ) {
    return this.charting.patientSummary(ctxOf(req), id, query);
  }

  @Get('medication-suggestions')
  @Authorize('clinical', 'prescription:read')
  medicationSuggestions(
    @Req() req: AuthedRequest,
    @Query(zQuery(medicationSuggestionsQuerySchema)) query: z.infer<typeof medicationSuggestionsQuerySchema>,
  ) {
    return this.charting.medicationSuggestions(ctxOf(req), query);
  }

  @Get('prescription-templates')
  @Authorize('clinical', 'prescription:read')
  listPrescriptionTemplates(
    @Req() req: AuthedRequest,
    @Query(zQuery(speciesQuerySchema)) query: z.infer<typeof speciesQuerySchema>,
  ) {
    return this.charting.listPrescriptionTemplates(ctxOf(req), query);
  }

  @Post('prescription-templates')
  @Authorize('clinical', 'prescription:template_manage')
  createPrescriptionTemplate(
    @Req() req: AuthedRequest,
    @Body(zBody(createPrescriptionTemplateSchema)) body: CreatePrescriptionTemplate,
  ) {
    return this.charting.createPrescriptionTemplate(ctxOf(req), body);
  }

  @Delete('prescription-templates/:id')
  @Authorize('clinical', 'prescription:template_manage')
  async removePrescriptionTemplate(@Req() req: AuthedRequest, @Param('id') id: string) {
    await this.charting.removePrescriptionTemplate(ctxOf(req), id);
    return { ok: true };
  }

  @Get('vaccine-protocols')
  @Authorize('immunization', 'immunization:read')
  protocolSuggestions(
    @Req() req: AuthedRequest,
    @Query(zQuery(protocolSuggestionsQuerySchema)) query: z.infer<typeof protocolSuggestionsQuerySchema>,
  ) {
    return this.charting.protocolSuggestions(ctxOf(req), query.patientId);
  }
}
