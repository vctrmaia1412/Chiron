import { Controller, Get, Query, Req } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { Authorize } from '../../auth/authorize.decorator';
import { AppError } from '../../common/errors';
import type { AuthedRequest } from '../../common/request-context';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @Authorize('core', 'tenant:read')
  load(@Req() req: AuthedRequest, @Query('facilityId') facilityId?: string, @Query('date') date?: string) {
    if (!req.ctx) throw AppError.unauthenticated();
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw AppError.validation('Data inválida.');
    return this.dashboard.load(req.ctx, { facilityId, date });
  }
}
