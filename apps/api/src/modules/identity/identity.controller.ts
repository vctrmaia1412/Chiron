import { Body, Controller, Delete, Get, Param, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import {
  acceptInvitationRequestSchema,
  forgotPasswordRequestSchema,
  loginRequestSchema,
  resetPasswordRequestSchema,
  stepUpRequestSchema,
  switchContextRequestSchema,
} from '@chiron/contracts';
import { IdentityService } from './identity.service';
import { AllowNoTenant, Public } from '../../auth/authorize.decorator';
import { zBody } from '../../common/zod-validation.pipe';
import { env } from '../../config/env';
import { AppError } from '../../common/errors';
import type { AuthedRequest } from '../../common/request-context';
import { logger } from '../../common/logger';

@Controller()
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  @Post('auth/login')
  @Public()
  async login(
    @Body(zBody(loginRequestSchema)) body: ReturnType<typeof loginRequestSchema.parse>,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.identity.login(body, {
      ip: req.ip ?? null,
      userAgent: (req.headers['user-agent'] as string) ?? null,
      requestId: req.requestId,
    });

    void reply.setCookie(env().COOKIE_NAME, result.token, this.identity.cookieOptions(result.expiresAt));
    return result.response;
  }

  @Post('auth/logout')
  @AllowNoTenant()
  async logout(@Req() req: AuthedRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    if (req.ctx) await this.identity.logout(req.ctx);
    void reply.clearCookie(env().COOKIE_NAME, { path: '/' });
    return { ok: true };
  }

  @Post('auth/password/forgot')
  @Public()
  async forgotPassword(@Body(zBody(forgotPasswordRequestSchema)) body: { email: string }) {
    const { token } = await this.identity.requestPasswordReset(body.email);
    // Em desenvolvimento o token vai para o log (não há provedor de e-mail).
    if (token && env().APP_ENV !== 'prod') {
      logger.info({ resetUrl: `${env().PUBLIC_APP_URL}/redefinir-senha?token=${token}` }, 'Link de redefinição gerado');
    }
    // Resposta uniforme: não revela se o e-mail existe.
    return { ok: true };
  }

  @Post('auth/password/reset')
  @Public()
  async resetPassword(@Body(zBody(resetPasswordRequestSchema)) body: { token: string; password: string }) {
    await this.identity.resetPassword(body.token, body.password);
    return { ok: true };
  }

  @Post('auth/invitations/accept')
  @Public()
  async acceptInvitation(
    @Body(zBody(acceptInvitationRequestSchema)) body: { token: string; name?: string; password?: string },
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.identity.acceptInvitation(body.token, body, {
      ip: req.ip ?? null,
      userAgent: (req.headers['user-agent'] as string) ?? null,
      requestId: req.requestId,
    });
    void reply.setCookie(env().COOKIE_NAME, result.token, this.identity.cookieOptions(result.expiresAt));
    return { ok: true, tenantId: result.tenantId };
  }

  @Post('auth/step-up')
  @AllowNoTenant()
  async stepUp(@Req() req: AuthedRequest, @Body(zBody(stepUpRequestSchema)) body: { password: string }) {
    if (!req.ctx) throw AppError.unauthenticated();
    await this.identity.stepUp(req.ctx, body.password);
    return { ok: true };
  }

  @Get('me/context')
  @AllowNoTenant()
  async meContext(@Req() req: AuthedRequest) {
    if (!req.ctx) throw AppError.unauthenticated();
    return this.identity.meContext(req.ctx);
  }

  @Post('me/context')
  @AllowNoTenant()
  async switchContext(
    @Req() req: AuthedRequest,
    @Body(zBody(switchContextRequestSchema)) body: { tenantId?: string; facilityId?: string | null },
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    if (!req.ctx) throw AppError.unauthenticated();
    const result = await this.identity.switchContext(req.ctx, body);
    void reply.setCookie(env().COOKIE_NAME, result.token, this.identity.cookieOptions(result.expiresAt));
    return { ok: true };
  }

  @Get('me/sessions')
  @AllowNoTenant()
  async sessions(@Req() req: AuthedRequest) {
    if (!req.ctx) throw AppError.unauthenticated();
    return { items: await this.identity.listSessions(req.ctx) };
  }

  @Delete('me/sessions/:id')
  @AllowNoTenant()
  async revokeSession(@Req() req: AuthedRequest, @Param('id') id: string) {
    if (!req.ctx) throw AppError.unauthenticated();
    await this.identity.revokeSession(req.ctx, id);
    return { ok: true };
  }
}
