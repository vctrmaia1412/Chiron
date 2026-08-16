import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { createServiceSchema, updateServiceSchema, createProfessionalSchema } from '@chiron/contracts';
import { CatalogService } from './catalog.service';
import { Authorize } from '../../auth/authorize.decorator';
import { zBody } from '../../common/zod-validation.pipe';
import { AppError } from '../../common/errors';
import type { AuthedRequest } from '../../common/request-context';

function ctxOf(req: AuthedRequest) {
  if (!req.ctx) throw AppError.unauthenticated();
  return req.ctx;
}

const createBreedSchema = z.object({
  speciesId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  sizeClass: z.enum(['toy', 'small', 'medium', 'large', 'giant']).optional(),
});

const upsertRangeSchema = z.object({
  speciesId: z.string().uuid(),
  parameterCode: z.string().trim().min(2).max(60),
  lifeStage: z.enum(['puppy', 'adult', 'senior']).nullable().optional(),
  minValue: z.number().nullable().optional(),
  maxValue: z.number().nullable().optional(),
  uom: z.string().trim().max(20),
});

@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('species')
  @Authorize('core', 'patient:read')
  async species(@Req() req: AuthedRequest) {
    return { items: await this.catalog.listSpecies(ctxOf(req)) };
  }

  @Get('breeds')
  @Authorize('core', 'patient:read')
  async breeds(@Req() req: AuthedRequest, @Query('speciesId') speciesId?: string) {
    return { items: await this.catalog.listBreeds(ctxOf(req), speciesId) };
  }

  @Post('breeds')
  @Authorize('core', 'catalog:manage')
  async createBreed(@Req() req: AuthedRequest, @Body(zBody(createBreedSchema)) body: z.infer<typeof createBreedSchema>) {
    return this.catalog.createBreed(ctxOf(req), body);
  }

  @Get('observation-codes')
  @Authorize('clinical', 'encounter:read')
  async observationCodes(@Req() req: AuthedRequest, @Query('speciesId') speciesId?: string) {
    return { items: await this.catalog.listObservationCodes(ctxOf(req), speciesId) };
  }

  @Get('reference-ranges')
  @Authorize('core', 'patient:read')
  async referenceRanges(@Req() req: AuthedRequest, @Query('speciesId') speciesId?: string) {
    return { items: await this.catalog.listReferenceRanges(ctxOf(req), speciesId) };
  }

  @Post('reference-ranges/:id/validate')
  @Authorize('core', 'catalog:manage')
  async validateRange(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.catalog.validateReferenceRange(ctxOf(req), id);
  }

  @Post('reference-ranges')
  @Authorize('core', 'catalog:manage')
  async upsertRange(@Req() req: AuthedRequest, @Body(zBody(upsertRangeSchema)) body: z.infer<typeof upsertRangeSchema>) {
    return this.catalog.upsertReferenceRange(ctxOf(req), body);
  }

  @Get('services')
  @Authorize('core', 'service:read')
  async services(@Req() req: AuthedRequest, @Query('includeInactive') includeInactive?: string) {
    return { items: await this.catalog.listServices(ctxOf(req), includeInactive === 'true') };
  }

  @Post('services')
  @Authorize('core', 'service:manage')
  async createService(@Req() req: AuthedRequest, @Body(zBody(createServiceSchema)) body: Record<string, unknown>) {
    return this.catalog.createService(ctxOf(req), body);
  }

  @Patch('services/:id')
  @Authorize('core', 'service:manage')
  async updateService(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(zBody(updateServiceSchema)) body: Record<string, unknown>,
  ) {
    return this.catalog.updateService(ctxOf(req), id, body);
  }

  @Get('professionals')
  @Authorize('core', 'professional:read')
  async professionals(@Req() req: AuthedRequest) {
    return { items: await this.catalog.listProfessionals(ctxOf(req)) };
  }

  @Post('professionals')
  @Authorize('core', 'professional:manage')
  async createProfessional(
    @Req() req: AuthedRequest,
    @Body(zBody(createProfessionalSchema)) body: Record<string, unknown>,
  ) {
    return this.catalog.createProfessional(ctxOf(req), body);
  }

  @Get('exam-catalog')
  @Authorize('lab', 'exam_order:read')
  async examCatalog(@Req() req: AuthedRequest) {
    return { items: await this.catalog.listExamCatalog(ctxOf(req)) };
  }
}
