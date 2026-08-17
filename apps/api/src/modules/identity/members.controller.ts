import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { inviteMemberRequestSchema, updateMemberRequestSchema, type InviteMemberRequest } from '@chiron/contracts';
import { MembersService } from './members.service';
import { Authorize, RequireStepUp } from '../../auth/authorize.decorator';
import { zBody } from '../../common/zod-validation.pipe';
import { AppError } from '../../common/errors';
import { env } from '../../config/env';
import { invitationUrl } from '../../common/mailer.service';
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

    // Quem convida não pode receber o token: com ele abriria o convite de outra
    // pessoa e passaria a agir sob a identidade dela. O link vai por e-mail para
    // `body.email` no envio feito pelo serviço; aqui é o único ponto em que o
    // token cru existe, porque o banco guarda apenas o hash. Em dev e test ele
    // volta na resposta para o fluxo poder ser percorrido sem provedor.
    const appEnv = env().APP_ENV;
    const exposeLink = appEnv === 'dev' || appEnv === 'test';

    return { id: result.id, inviteUrl: exposeLink ? invitationUrl(result.token) : undefined };
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
