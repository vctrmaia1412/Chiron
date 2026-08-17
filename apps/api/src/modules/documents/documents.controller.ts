import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import {
  completeUploadSchema,
  createConsentSchema,
  createUploadSchema,
  generateDocumentSchema,
  type CreateUpload,
  type GenerateDocument,
} from '@chiron/contracts';
import { DocumentsService } from './documents.service';
import { Authorize } from '../../auth/authorize.decorator';
import { zBody } from '../../common/zod-validation.pipe';
import { AppError } from '../../common/errors';
import type { AuthedRequest } from '../../common/request-context';

function ctxOf(req: AuthedRequest) {
  if (!req.ctx) throw AppError.unauthenticated();
  return req.ctx;
}

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  /** Documentos de conteúdo clínico só saem para quem tem `record:read_sensitive`. */
  @Get()
  @Authorize('documents', 'document:read')
  list(
    @Req() req: AuthedRequest,
    @Query('patientId') patientId?: string,
    @Query('encounterId') encounterId?: string,
    @Query('kind') kind?: string,
    @Query('limit') limit?: string,
  ) {
    return this.documents.list(ctxOf(req), {
      patientId,
      encounterId,
      kind,
      limit: Math.min(Number(limit ?? 50) || 50, 200),
    });
  }

  /** Passo 1: registra o documento e devolve URL assinada para o navegador enviar o arquivo. */
  @Post('uploads')
  @Authorize('documents', 'document:create')
  createUpload(@Req() req: AuthedRequest, @Body(zBody(createUploadSchema)) body: CreateUpload) {
    return this.documents.createUpload(ctxOf(req), body);
  }

  /** Passo 2: confere tamanho e conteúdo enviado (magic bytes) e ativa o documento. */
  @Post(':id/complete')
  @Authorize('documents', 'document:create')
  completeUpload(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(zBody(completeUploadSchema)) _body: z.infer<typeof completeUploadSchema>,
  ) {
    void _body;
    return this.documents.completeUpload(ctxOf(req), id);
  }

  /** A URL assinada de documento clínico exige `record:read_sensitive`, conferido no serviço. */
  @Get(':id/download')
  @Authorize('documents', 'document:read')
  download(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.documents.downloadUrl(ctxOf(req), id);
  }

  @Post('generate')
  @Authorize('documents', 'document:generate')
  generate(@Req() req: AuthedRequest, @Body(zBody(generateDocumentSchema)) body: GenerateDocument) {
    return this.documents.generate(ctxOf(req), body);
  }

  @Get('consents')
  @Authorize('documents', 'document:read')
  listConsents(@Req() req: AuthedRequest, @Query('guardianId') guardianId: string) {
    if (!guardianId) throw AppError.validation('Informe o tutor.');
    return this.documents.listConsents(ctxOf(req), guardianId);
  }

  @Post('consents')
  @Authorize('documents', 'consent:manage')
  createConsent(
    @Req() req: AuthedRequest,
    @Body(zBody(createConsentSchema)) body: z.infer<typeof createConsentSchema>,
  ) {
    return this.documents.createConsent(ctxOf(req), body);
  }
}
