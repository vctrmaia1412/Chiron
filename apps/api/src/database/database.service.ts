import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, type PoolClient, type PoolConfig, type QueryResultRow } from 'pg';
import { env } from '../config/env';
import { logger } from '../common/logger';

export interface TenantContext {
  tenantId: string | null;
  userId?: string | null;
  membershipId?: string | null;
  requestId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  onBehalfOf?: string | null;
  invitationTokenHash?: string | null;
}

export type Executor = {
  query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
};

/**
 * Limites de tempo comuns aos três pools. Sem eles, um banco pausado deixa a
 * requisição pendurada para sempre em vez de devolver erro:
 *   connectionTimeoutMillis  desiste de abrir conexão
 *   statement_timeout        o servidor corta a consulta
 *   query_timeout            o cliente corta quando o servidor nem responde
 */
const POOL_TIMEOUTS: PoolConfig = {
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  statement_timeout: 15000,
  query_timeout: 20000,
  keepAlive: true,
};

/**
 * Acesso ao banco com três pools de papéis distintos:
 *   app    caminho normal de request (RLS aplicado)
 *   iam    módulo identity (tabelas globais de identidade)
 *   admin  relay da outbox e jobs cross-tenant (BYPASSRLS)
 *
 * Toda operação de negócio passa por `withTenant`, que abre transação e define
 * o contexto com `set_config(..., true)` (equivalente transacional de SET LOCAL,
 * porém parametrizável: nunca interpolamos string em SQL).
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private appPool!: Pool;
  private iamPool!: Pool;
  private adminPool!: Pool;

  onModuleInit(): void {
    const cfg = env();
    // `application_name` distinto por pool: identifica o papel nas estatísticas
    // do provedor (pg_stat_activity) quando algo trava em produção.
    this.appPool = new Pool({
      connectionString: cfg.DATABASE_URL,
      max: cfg.DATABASE_POOL_MAX,
      application_name: 'chiron-api-app',
      ...POOL_TIMEOUTS,
    });
    this.iamPool = new Pool({
      connectionString: cfg.DATABASE_IAM_URL ?? cfg.DATABASE_URL,
      max: Math.max(2, Math.floor(cfg.DATABASE_POOL_MAX / 2)),
      application_name: 'chiron-api-iam',
      ...POOL_TIMEOUTS,
    });
    this.adminPool = new Pool({
      connectionString: cfg.DATABASE_ADMIN_URL ?? cfg.DATABASE_URL,
      max: 4,
      application_name: 'chiron-api-admin',
      ...POOL_TIMEOUTS,
    });
    for (const [name, pool] of [
      ['app', this.appPool],
      ['iam', this.iamPool],
      ['admin', this.adminPool],
    ] as const) {
      pool.on('error', (err) => logger.error({ err, pool: name }, 'Erro inesperado no pool de conexões'));
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([this.appPool?.end(), this.iamPool?.end(), this.adminPool?.end()]);
  }

  /** Pool do módulo identity: tabelas globais (users, sessions, invitations). */
  get iam(): Pool {
    return this.iamPool;
  }

  /** Pool administrativo: relay da outbox e jobs cross-tenant. Uso auditado. */
  get admin(): Pool {
    return this.adminPool;
  }

  /**
   * Executa uma função dentro de uma transação com o contexto de tenant.
   * Sem `tenantId`, o RLS devolve zero linhas (fail closed) por construção.
   */
  async withTenant<T>(ctx: TenantContext, fn: (tx: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.appPool.connect();
    try {
      await client.query('BEGIN');
      await this.applyContext(client, ctx);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // conexão já perdida
      }
      throw error;
    } finally {
      client.release();
    }
  }

  /** Transação com o papel de identidade (login, convite, reset de senha). */
  async withIam<T>(ctx: TenantContext, fn: (tx: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.iamPool.connect();
    try {
      await client.query('BEGIN');
      await this.applyContext(client, ctx);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore
      }
      throw error;
    } finally {
      client.release();
    }
  }

  /** Transação administrativa cross-tenant (relay, jobs). */
  async withAdmin<T>(fn: (tx: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.adminPool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private async applyContext(client: PoolClient, ctx: TenantContext): Promise<void> {
    // set_config(nome, valor, true) = SET LOCAL parametrizável.
    await client.query(
      `SELECT
         set_config('app.tenant_id', $1, true),
         set_config('app.user_id', $2, true),
         set_config('app.membership_id', $3, true),
         set_config('app.request_id', $4, true),
         set_config('app.ip', $5, true),
         set_config('app.user_agent', $6, true),
         set_config('app.on_behalf_of', $7, true),
         set_config('app.invitation_token_hash', $8, true)`,
      [
        ctx.tenantId ?? '',
        ctx.userId ?? '',
        ctx.membershipId ?? '',
        ctx.requestId ?? '',
        ctx.ip ?? '',
        ctx.userAgent ?? '',
        ctx.onBehalfOf ?? '',
        ctx.invitationTokenHash ?? '',
      ],
    );
  }

  async healthy(): Promise<boolean> {
    try {
      const { rows } = await this.appPool.query('SELECT 1 AS ok');
      return rows.length === 1;
    } catch {
      return false;
    }
  }
}
