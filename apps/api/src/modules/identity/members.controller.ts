import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { inviteMemberRequestSchema, updateMemberRequestSchema, type InviteMemberRequest } from '@chiron/contracts';
import { MembersService } from './members.service';
import { Authorize, RequireStepUp } from '../../auth/authorize.decorator';
import { zBody } from '../../common/zod-validation.pipe';
import { AppError } from '../../common/errors';
import { env } from '../../config/env';
import { logger } from '../../common/logger';
import type { AuthedRequest } from '../../common/request-context';

function ctxOf(req: AuthedRequest) {
  if (!req.ctx) throw AppError.unauthenticated();
  return req.ctx;
}

@Controller()
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get('members')
  @Authorize('core', 'member:read')
  async list(@Req() req: AuthedRequest) {
    return { items: await this.members.list(ctxOf(req)) };
  }

  @Post('members/invite')
  @Authorize('core', 'member:invite')
  async invite(@Req() req: AuthedRequest, @Body(zBody(inviteMemberRequestSchema)) body: InviteMemberRequest) {
    const result = await this.members.invite(ctxOf(req), body);
    const inviteUrl = `${env().PUBLIC_APP_URL}/convite/${result.token}`;
    if (env().APP_ENV !== 'prod') {
      logger.info({ inviteUrl }, 'Convite gerado');
    }
    return { id: result.id, inviteUrl };
  }

  @Patch('members/:id')
  @Authorize('core', 'member:update')
  @RequireStepUp()
  async update(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(zBody(updateMemberRequestSchema)) body: Record<string, unknown>,
  ) {
    await this.members.update(ctxOf(req), id, body as never);
    return { ok: true };
  }

  @Delete('members/:id')
  @Authorize('core', 'member:remove')
  @RequireStepUp()
  async remove(@Req() req: AuthedRequest, @Param('id') id: string) {
    await this.members.remove(ctxOf(req), id);
    return { ok: true };
  }

  @Get('roles')
  @Authorize('core', 'role:read')
  async roles(@Req() req: AuthedRequest) {
    return { items: await this.members.listRoles(ctxOf(req)) };
  }
}
