import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import {
  cancelAppointmentSchema,
  checkInSchema,
  createAppointmentSchema,
  listAppointmentsQuerySchema,
  listFollowUpsQuerySchema,
  updateAppointmentSchema,
  type CheckIn,
  type CreateAppointment,
} from '@chiron/contracts';
import { AppointmentsService } from './appointments.service';
import { Authorize } from '../../auth/authorize.decorator';
import { zBody, zQuery } from '../../common/zod-validation.pipe';
import { AppError } from '../../common/errors';
import type { AuthedRequest } from '../../common/request-context';

function ctxOf(req: AuthedRequest) {
  if (!req.ctx) throw AppError.unauthenticated();
  return req.ctx;
}

@Controller()
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get('appointments')
  @Authorize('scheduling', 'appointment:read')
  list(
    @Req() req: AuthedRequest,
    @Query(zQuery(listAppointmentsQuerySchema)) query: Record<string, never> & { limit: number },
  ) {
    return this.appointments.list(ctxOf(req), query as never);
  }

  @Get('appointments/:id')
  @Authorize('scheduling', 'appointment:read')
  get(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.appointments.get(ctxOf(req), id);
  }

  @Post('appointments')
  @Authorize('scheduling', 'appointment:create')
  create(@Req() req: AuthedRequest, @Body(zBody(createAppointmentSchema)) body: CreateAppointment) {
    return this.appointments.create(ctxOf(req), body);
  }

  @Patch('appointments/:id')
  @Authorize('scheduling', 'appointment:update')
  update(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(zBody(updateAppointmentSchema)) body: Record<string, unknown>,
  ) {
    return this.appointments.update(ctxOf(req), id, body);
  }

  @Post('appointments/:id/confirm')
  @Authorize('scheduling', 'appointment:update')
  confirm(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.appointments.transition(ctxOf(req), id, 'confirmed');
  }

  @Post('appointments/:id/check-in')
  @Authorize('scheduling', 'appointment:checkin')
  checkIn(@Req() req: AuthedRequest, @Param('id') id: string, @Body(zBody(checkInSchema)) body: CheckIn) {
    return this.appointments.checkIn(ctxOf(req), id, body);
  }

  @Post('appointments/:id/cancel')
  @Authorize('scheduling', 'appointment:cancel')
  cancel(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(zBody(cancelAppointmentSchema)) body: { reason: string },
  ) {
    return this.appointments.transition(ctxOf(req), id, 'cancelled', { reason: body.reason });
  }

  @Post('appointments/:id/no-show')
  @Authorize('scheduling', 'appointment:cancel')
  noShow(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.appointments.transition(ctxOf(req), id, 'no_show', { reason: 'Paciente não compareceu' });
  }

  @Get('follow-ups')
  @Authorize('scheduling', 'appointment:read')
  followUps(
    @Req() req: AuthedRequest,
    @Query(zQuery(listFollowUpsQuerySchema)) query: { dueUntil?: string; limit: number },
  ) {
    return this.appointments.listFollowUps(ctxOf(req), query);
  }
}
