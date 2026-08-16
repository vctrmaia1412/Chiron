import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import {
  createExamOrderSchema,
  examOrderItemStatusSchema,
  submitExamResultSchema,
  type CreateExamOrder,
  type SubmitExamResult,
} from '@chiron/contracts';
import type { ExamOrderItemStatus } from '@chiron/domain';
import { ExamsService } from './exams.service';
import { Authorize } from '../../auth/authorize.decorator';
import { zBody } from '../../common/zod-validation.pipe';
import { AppError } from '../../common/errors';
import type { AuthedRequest } from '../../common/request-context';

function ctxOf(req: AuthedRequest) {
  if (!req.ctx) throw AppError.unauthenticated();
  return req.ctx;
}

const transitionSchema = z.object({
  status: examOrderItemStatusSchema,
  reason: z.string().trim().max(300).optional(),
});

const cancelSchema = z.object({ reason: z.string().trim().min(3).max(300) });

@Controller('exam-orders')
export class ExamsController {
  constructor(private readonly exams: ExamsService) {}

  @Get()
  @Authorize('lab', 'exam_order:read')
  list(
    @Req() req: AuthedRequest,
    @Query('patientId') patientId?: string,
    @Query('encounterId') encounterId?: string,
    @Query('status') status?: string,
    @Query('pending') pending?: string,
    @Query('limit') limit?: string,
  ) {
    return this.exams.list(ctxOf(req), {
      patientId,
      encounterId,
      status,
      pending: pending === 'true' || pending === '1',
      limit: Math.min(Number(limit ?? 50) || 50, 200),
    });
  }

  @Get('laboratories')
  @Authorize('lab', 'exam_order:read')
  laboratories(@Req() req: AuthedRequest) {
    return this.exams.laboratories(ctxOf(req));
  }

  @Get(':id')
  @Authorize('lab', 'exam_order:read')
  get(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.exams.get(ctxOf(req), id);
  }

  @Post()
  @Authorize('lab', 'exam_order:create')
  create(@Req() req: AuthedRequest, @Body(zBody(createExamOrderSchema)) body: CreateExamOrder) {
    return this.exams.create(ctxOf(req), body);
  }

  @Post(':id/cancel')
  @Authorize('lab', 'exam_order:cancel')
  cancel(@Req() req: AuthedRequest, @Param('id') id: string, @Body(zBody(cancelSchema)) body: { reason: string }) {
    return this.exams.cancel(ctxOf(req), id, body.reason);
  }

  @Post('items/:itemId/transition')
  @Authorize('lab', 'exam:collect')
  transition(
    @Req() req: AuthedRequest,
    @Param('itemId') itemId: string,
    @Body(zBody(transitionSchema)) body: z.infer<typeof transitionSchema>,
  ) {
    return this.exams.transitionItem(ctxOf(req), itemId, body.status as ExamOrderItemStatus, body.reason);
  }

  @Post('items/:itemId/result')
  @Authorize('lab', 'exam_result:submit')
  submitResult(
    @Req() req: AuthedRequest,
    @Param('itemId') itemId: string,
    @Body(zBody(submitExamResultSchema)) body: SubmitExamResult,
  ) {
    return this.exams.submitResult(ctxOf(req), itemId, body);
  }

  @Post('results/:resultId/review')
  @Authorize('lab', 'exam_result:sign')
  review(@Req() req: AuthedRequest, @Param('resultId') resultId: string) {
    return this.exams.reviewResult(ctxOf(req), resultId);
  }
}
