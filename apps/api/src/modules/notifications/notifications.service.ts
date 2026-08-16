import { Injectable } from '@nestjs/common';
import type { Notification } from '@chiron/contracts';
import { DatabaseService } from '../../database/database.service';
import { AppError } from '../../common/errors';
import type { RequestContext } from '../../common/request-context';
import { contextToTenantContext } from '../../common/request-context';

/** Notificações internas do usuário no tenant ativo. */
@Injectable()
export class NotificationsService {
  constructor(private readonly db: DatabaseService) {}

  async list(ctx: RequestContext, unreadOnly: boolean, limit: number): Promise<{ items: Notification[]; unread: number }> {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query<{
        id: string;
        kind: string;
        title: string;
        body: string | null;
        link: string | null;
        read_at: Date | null;
        created_at: Date;
      }>(
        `SELECT id, kind, title, body, link, read_at, created_at
           FROM platform.notifications
          WHERE tenant_id = $1 AND user_id = $2
            AND ($3::boolean IS NOT TRUE OR read_at IS NULL)
          ORDER BY created_at DESC
          LIMIT $4`,
        [ctx.tenantId, ctx.user.id, unreadOnly, limit],
      );

      const unread = await tx.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM platform.notifications
          WHERE tenant_id = $1 AND user_id = $2 AND read_at IS NULL`,
        [ctx.tenantId, ctx.user.id],
      );

      return {
        items: rows.map((r) => ({
          id: r.id,
          kind: r.kind,
          title: r.title,
          body: r.body,
          link: r.link,
          readAt: r.read_at?.toISOString() ?? null,
          createdAt: r.created_at.toISOString(),
        })),
        unread: Number(unread.rows[0]?.count ?? 0),
      };
    });
  }

  async markRead(ctx: RequestContext, id: string): Promise<{ ok: true }> {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rowCount } = await tx.query(
        `UPDATE platform.notifications SET read_at = now()
          WHERE id = $1 AND tenant_id = $2 AND user_id = $3 AND read_at IS NULL`,
        [id, ctx.tenantId, ctx.user.id],
      );
      if (rowCount === 0) {
        const exists = await tx.query(
          `SELECT 1 FROM platform.notifications WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
          [id, ctx.tenantId, ctx.user.id],
        );
        if (exists.rows.length === 0) throw AppError.notFound('Notificação');
      }
      return { ok: true as const };
    });
  }

  async markAllRead(ctx: RequestContext): Promise<{ updated: number }> {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rowCount } = await tx.query(
        `UPDATE platform.notifications SET read_at = now()
          WHERE tenant_id = $1 AND user_id = $2 AND read_at IS NULL`,
        [ctx.tenantId, ctx.user.id],
      );
      return { updated: rowCount ?? 0 };
    });
  }
}
