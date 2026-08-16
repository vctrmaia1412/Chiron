import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { SearchService } from './search.service';
import { Authorize } from '../../auth/authorize.decorator';
import { zBody } from '../../common/zod-validation.pipe';
import { AppError } from '../../common/errors';
import type { AuthedRequest } from '../../common/request-context';

const scanSchema = z.object({ code: z.string().trim().min(1).max(200) });

@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  @Authorize('core', 'search:use')
  query(@Req() req: AuthedRequest, @Query('q') q?: string, @Query('limit') limit?: string) {
    if (!req.ctx) throw AppError.unauthenticated();
    return this.search.search(req.ctx, q ?? '', Math.min(Number(limit ?? 8) || 8, 25));
  }

  /** Resolve um código lido por câmera, leitor USB ou Bluetooth, ou digitado. */
  @Post('scan')
  @Authorize('core', 'search:use')
  scan(@Req() req: AuthedRequest, @Body(zBody(scanSchema)) body: { code: string }) {
    if (!req.ctx) throw AppError.unauthenticated();
    return this.search.scan(req.ctx, body.code);
  }
}
