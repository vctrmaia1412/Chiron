import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import {
  inviteMemberRequestSchema,
  updateMemberRequestSchema,
  uuidSchema,
  type InviteMemberRequest,
  type InviteMemberResponse,
} from '@chiron/contracts';
import { MembersService, type IssuedInvitation } from './members.service';
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

/** Id fora do formato é convite que não existe, não erro de banco. */
function invitationIdOf(id: string): string {
  if (!uuidSchema.safeParse(id).success) throw AppError.notFound('Convite');
  return id;
}

/**
 * Quem convida não pode receber o token: com ele abriria o convite de outra
 * pessoa e passaria a agir sob a identidade dela. O link vai por e-mail para o
 * convidado no envio feito pelo serviço; aqui é o único ponto em que o token
 * cru existe, porque o banco guarda apenas o hash. Em dev e test ele volta na
 * resposta para o fluxo poder ser percorrido sem provedor.
 */
function issuedResponse(issued: IssuedInvitation): InviteMemberResponse {
  const appEnv = env().APP_ENV;
  const exposeLink = appEnv === 'dev' || appEnv === 'test';
  return {
    id: issued.id,
    email: issued.email,
    expiresAt: issued.expiresAt,
    inviteUrl: exposeLink ? invitationUrl(issued.token) : undefined,
  };
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
    return issuedResponse(await this.members.invite(ctxOf(req), body));
  }

  // Mesma permissão do convite: a lista expõe e-mails de quem ainda não é
  // membro, e reenviar ou revogar é continuar ou desfazer o ato de convidar.
  @Get('members/invitations')
  @Authorize('core', 'member:invite')
  async invitations(@Req() req: AuthedRequest) {
    return { items: await this.members.listInvitations(ctxOf(req)) };
  }

  @Post('members/invitations/:id/resend')
  @Authorize('core', 'member:invite')
  async resendInvitation(@Req() req: AuthedRequest, @Param('id') id: string) {
    return issuedResponse(await this.members.resendInvitation(ctxOf(req), invitationIdOf(id)));
  }

  @Delete('members/invitations/:id')
  @Authorize('core', 'member:invite')
  async revokeInvitation(@Req() req: AuthedRequest, @Param('id') id: string) {
    await this.members.revokeInvitation(ctxOf(req), invitationIdOf(id));
    return { ok: true };
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
