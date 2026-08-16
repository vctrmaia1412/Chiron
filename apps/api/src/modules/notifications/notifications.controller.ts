import { Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { Authorize } from '../../auth/authorize.decorator';
import { AppError } from '../../common/errors';
import type { AuthedRequest } from '../../common/request-context';

function ctxOf(req: AuthedRequest) {
  if (!req.ctx) throw AppError.unauthenticated();
  return req.ctx;
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @Authorize('comms', 'notification:read')
  list(@Req() req: AuthedRequest, @Query('unread') unread?: string, @Query('limit') limit?: string) {
    return this.notifications.list(
      ctxOf(req),
      unread === 'true' || unread === '1',
      Math.min(Number(limit ?? 30) || 30, 100),
    );
  }

  @Post(':id/read')
  @Authorize('comms', 'notification:read')
  markRead(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.notifications.markRead(ctxOf(req), id);
  }

  @Post('read-all')
  @Authorize('comms', 'notification:read')
  markAllRead(@Req() req: AuthedRequest) {
    return this.notifications.markAllRead(ctxOf(req));
  }
}
