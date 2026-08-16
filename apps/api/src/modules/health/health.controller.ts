import { Controller, Get } from '@nestjs/common';
import { Public } from '../../auth/authorize.decorator';
import { DatabaseService } from '../../database/database.service';

@Controller()
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  /** Liveness: o processo está de pé. */
  @Get('health')
  @Public()
  health() {
    return { status: 'ok', uptime: Math.round(process.uptime()) };
  }

  /** Readiness: dependências essenciais respondem. */
  @Get('ready')
  @Public()
  async ready() {
    const database = await this.db.healthy();
    const status = database ? 'ok' : 'degraded';
    return { status, checks: { database } };
  }
}
