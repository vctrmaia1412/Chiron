import { Body, Controller, Get, Param, Patch, Put, Req } from '@nestjs/common';
import { z } from 'zod';
import { MODULE_KEYS } from '@chiron/contracts';
import { TenantService } from './tenant.service';
import { Authorize } from '../../auth/authorize.decorator';
import { zBody } from '../../common/zod-validation.pipe';
import { AppError } from '../../common/errors';
import type { AuthedRequest } from '../../common/request-context';

const updateTenantSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  timezone: z.string().trim().max(60).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

const updateFacilitySchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  phone: z.string().trim().max(30).optional(),
  timezone: z.string().trim().max(60).optional(),
  address: z.record(z.string(), z.unknown()).optional(),
  allowScheduleOverlap: z.boolean().optional(),
});

const setEntitlementSchema = z.object({
  state: z.enum(['active', 'disabled']),
});

function ctxOf(req: AuthedRequest) {
  if (!req.ctx) throw AppError.unauthenticated();
  return req.ctx;
}

@Controller()
export class TenantController {
  constructor(private readonly tenants: TenantService) {}

  @Get('tenant')
  @Authorize('core', 'tenant:read')
  get(@Req() req: AuthedRequest) {
    return this.tenants.get(ctxOf(req));
  }

  @Patch('tenant')
  @Authorize('core', 'tenant:update')
  update(@Req() req: AuthedRequest, @Body(zBody(updateTenantSchema)) body: z.infer<typeof updateTenantSchema>) {
    return this.tenants.update(ctxOf(req), body);
  }

  @Get('facilities')
  @Authorize('core', 'facility:read')
  facilities(@Req() req: AuthedRequest) {
    return this.tenants.listFacilities(ctxOf(req)).then((items) => ({ items }));
  }

  @Patch('facilities/:id')
  @Authorize('core', 'facility:manage')
  updateFacility(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(zBody(updateFacilitySchema)) body: z.infer<typeof updateFacilitySchema>,
  ) {
    return this.tenants.updateFacility(ctxOf(req), id, body);
  }

  @Get('entitlements')
  @Authorize('core', 'entitlement:read')
  entitlements(@Req() req: AuthedRequest) {
    return this.tenants.listEntitlements(ctxOf(req)).then((items) => ({ items }));
  }

  @Put('entitlements/:moduleKey')
  @Authorize('core', 'tenant:update')
  setEntitlement(
    @Req() req: AuthedRequest,
    @Param('moduleKey') moduleKey: string,
    @Body(zBody(setEntitlementSchema)) body: z.infer<typeof setEntitlementSchema>,
  ) {
    if (!(MODULE_KEYS as readonly string[]).includes(moduleKey)) {
      throw AppError.validation('Módulo desconhecido.');
    }
    return this.tenants.setEntitlement(ctxOf(req), moduleKey as (typeof MODULE_KEYS)[number], body.state);
  }
}
