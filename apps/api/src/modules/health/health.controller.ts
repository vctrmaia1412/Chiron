import { Controller, Get, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { Public } from '../../auth/authorize.decorator';
import { DatabaseService } from '../../database/database.service';
import { StorageService } from '../documents/storage.service';

/** O próprio /ready não pode pendurar: banco mudo por 2s já conta como fora. */
const DATABASE_CHECK_TIMEOUT_MS = 2000;

@Controller()
export class HealthController {
  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
  ) {}

  /** Liveness: o processo está de pé. */
  @Get('health')
  @Public()
  health() {
    return { status: 'ok', uptime: Math.round(process.uptime()) };
  }

  /** Readiness: dependências essenciais respondem. */
  @Get('ready')
  @Public()
  async ready(@Res({ passthrough: true }) reply: FastifyReply) {
    const database = await this.checkDatabase();
    const storage = await this.storage.isAvailable();
    const status = database ? 'ok' : 'degraded';
    // Com 200 no corpo degradado nenhum monitor externo percebe a queda.
    // O storage entra só como informação: sem ele a API ainda atende.
    if (!database) reply.status(503);
    return { status, checks: { database, storage } };
  }

  private async checkDatabase(): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), DATABASE_CHECK_TIMEOUT_MS);
    });
    try {
      return await Promise.race([this.db.healthy(), expired]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
