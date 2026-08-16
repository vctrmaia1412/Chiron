import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { aggregateExamOrderStatus, assertExamItemTransition, type ExamOrderItemStatus } from '@chiron/domain';
import type { CreateExamOrder, ExamOrder, SubmitExamResult } from '@chiron/contracts';
import { DatabaseService } from '../../database/database.service';
import { AuditService } from '../../common/audit.service';
import { AppError } from '../../common/errors';
import { uuidv7 } from '../../common/uuid';
import type { RequestContext } from '../../common/request-context';
import { contextToTenantContext, facilityScope } from '../../common/request-context';

type Queryable = PoolClient;

interface OrderRow {
  id: string;
  number: string;
  patient_id: string;
  patient_name: string;
  species_name: string;
  encounter_id: string | null;
  status: string;
  priority: string;
  clinical_info: string | null;
  ordered_at: Date;
  ordered_by_name: string | null;
}

interface ItemRow {
  id: string;
  exam_order_id: string;
  exam_catalog_id: string;
  exam_name: string;
  category: string;
  status: string;
  collected_at: Date | null;
  laboratory_name: string | null;
  result_id: string | null;
  result_status: string | null;
  report_text: string | null;
  interpretation: string | null;
  report_document_id: string | null;
  released_at: Date | null;
  released_by_name: string | null;
  reviewed_at: Date | null;
  reviewed_by_name: string | null;
}

interface ValueRow {
  id: string;
  exam_result_id: string;
  analyte_code: string;
  analyte_name: string;
  value_numeric: string | null;
  value_text: string | null;
  uom: string | null;
  ref_min: string | null;
  ref_max: string | null;
  abnormal_flag: string | null;
}

const ORDER_SELECT = `
  o.id, o.number::text AS number, o.patient_id, p.name AS patient_name, s.name_pt AS species_name,
  o.encounter_id, o.status, o.priority, o.clinical_info, o.ordered_at,
  pr.name AS ordered_by_name
`;

const ORDER_FROM = `
  FROM lab.exam_orders o
  JOIN registry.patients p ON p.id = o.patient_id AND p.tenant_id = o.tenant_id
  JOIN registry.species s ON s.id = p.species_id
  LEFT JOIN registry.professionals pr
    ON pr.id = o.ordered_by_professional_id AND pr.tenant_id = o.tenant_id
`;

/**
 * Pedidos de exame e resultados. Resultado liberado nunca é sobrescrito:
 * uma retificação cria um novo resultado que supersede o anterior, e o
 * anterior permanece consultável (mesma regra das notas clínicas).
 */
@Injectable()
export class ExamsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async list(
    ctx: RequestContext,
    params: { patientId?: string; encounterId?: string; status?: string; pending?: boolean; limit: number },
  ): Promise<{ items: ExamOrder[] }> {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const scope = facilityScope(ctx);
      const orders = await tx.query<OrderRow>(
        `SELECT ${ORDER_SELECT}
         ${ORDER_FROM}
          WHERE o.tenant_id = $1
            AND ($2::uuid IS NULL OR o.patient_id = $2)
            AND ($3::uuid IS NULL OR o.encounter_id = $3)
            AND ($4::text IS NULL OR o.status = $4)
            AND ($5::boolean IS NOT TRUE OR o.status IN ('ordered', 'partially_resulted', 'resulted'))
            AND ($6::uuid[] IS NULL OR o.facility_id = ANY($6))
          ORDER BY o.ordered_at DESC
          LIMIT $7`,
        [
          ctx.tenantId,
          params.patientId ?? null,
          params.encounterId ?? null,
          params.status ?? null,
          params.pending ?? null,
          scope,
          params.limit,
        ],
      );
      if (orders.rows.length === 0) return { items: [] };

      const ids = orders.rows.map((r) => r.id);
      const { items, values } = await this.loadItems(tx, ctx.tenantId as string, ids);
      return { items: orders.rows.map((row) => this.toOrder(row, items, values)) };
    });
  }

  async get(ctx: RequestContext, id: string): Promise<ExamOrder> {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query<OrderRow>(
        `SELECT ${ORDER_SELECT} ${ORDER_FROM} WHERE o.tenant_id = $1 AND o.id = $2`,
        [ctx.tenantId, id],
      );
      const row = rows[0];
      if (!row) throw AppError.notFound('Pedido de exame');

      const { items, values } = await this.loadItems(tx, ctx.tenantId as string, [id]);
      return this.toOrder(row, items, values);
    });
  }

  private async loadItems(
    tx: Queryable,
    tenantId: string,
    orderIds: string[],
  ): Promise<{ items: ItemRow[]; values: ValueRow[] }> {
    const items = await tx.query<ItemRow>(
      `SELECT i.id, i.exam_order_id, i.exam_catalog_id, ec.name AS exam_name, ec.category,
              i.status, i.collected_at, lb.name AS laboratory_name,
              r.id AS result_id, r.status AS result_status, r.report_text, r.interpretation,
              r.report_document_id, r.released_at,
              ru.name AS released_by_name, r.reviewed_at, rv.name AS reviewed_by_name
         FROM lab.exam_order_items i
         JOIN lab.exam_catalog ec ON ec.id = i.exam_catalog_id
         LEFT JOIN lab.laboratories lb ON lb.id = i.laboratory_id AND lb.tenant_id = i.tenant_id
         LEFT JOIN LATERAL (
           SELECT r2.* FROM lab.exam_results r2
            WHERE r2.exam_order_item_id = i.id AND r2.tenant_id = i.tenant_id
              AND r2.superseded_by_result_id IS NULL AND r2.status <> 'entered_in_error'
            ORDER BY r2.released_at DESC LIMIT 1
         ) r ON true
         LEFT JOIN iam.users ru ON ru.id = r.released_by
         LEFT JOIN iam.users rv ON rv.id = r.reviewed_by
        WHERE i.tenant_id = $1 AND i.exam_order_id = ANY($2)
        ORDER BY ec.name`,
      [tenantId, orderIds],
    );

    const resultIds = items.rows.map((i) => i.result_id).filter((v): v is string => v !== null);
    const values: { rows: ValueRow[] } =
      resultIds.length === 0
        ? { rows: [] }
        : await tx.query<ValueRow>(
            `SELECT id, exam_result_id, analyte_code, analyte_name, value_numeric::text AS value_numeric,
                    value_text, uom, ref_min::text AS ref_min, ref_max::text AS ref_max, abnormal_flag
               FROM lab.exam_result_values
              WHERE tenant_id = $1 AND exam_result_id = ANY($2)
              ORDER BY sort, analyte_name`,
            [tenantId, resultIds],
          );

    return { items: items.rows, values: values.rows };
  }

  private toOrder(row: OrderRow, allItems: ItemRow[], allValues: ValueRow[]): ExamOrder {
    return {
      id: row.id,
      number: Number(row.number),
      patient: { id: row.patient_id, name: row.patient_name, speciesName: row.species_name },
      encounterId: row.encounter_id,
      status: row.status as ExamOrder['status'],
      priority: row.priority as ExamOrder['priority'],
      clinicalInfo: row.clinical_info,
      orderedAt: row.ordered_at.toISOString(),
      orderedByName: row.ordered_by_name,
      items: allItems
        .filter((i) => i.exam_order_id === row.id)
        .map((i) => ({
          id: i.id,
          examCatalogId: i.exam_catalog_id,
          examName: i.exam_name,
          category: i.category as ExamOrder['items'][number]['category'],
          status: i.status as ExamOrderItemStatus,
          collectedAt: i.collected_at?.toISOString() ?? null,
          laboratoryName: i.laboratory_name,
          result: i.result_id
            ? {
                id: i.result_id,
                status: i.result_status as 'preliminary' | 'final' | 'amended' | 'entered_in_error',
                reportText: i.report_text,
                interpretation: i.interpretation,
                documentId: i.report_document_id,
                releasedAt: (i.released_at ?? new Date()).toISOString(),
                releasedByName: i.released_by_name,
                reviewedAt: i.reviewed_at?.toISOString() ?? null,
                reviewedByName: i.reviewed_by_name,
                values: allValues
                  .filter((v) => v.exam_result_id === i.result_id)
                  .map((v) => ({
                    id: v.id,
                    analyteCode: v.analyte_code,
                    analyteName: v.analyte_name,
                    valueNumeric: v.value_numeric,
                    valueText: v.value_text,
                    uom: v.uom,
                    refMin: v.ref_min,
                    refMax: v.ref_max,
                    abnormalFlag: v.abnormal_flag as 'low' | 'normal' | 'high' | 'critical' | null,
                  })),
              }
            : null,
        })),
    };
  }

  async create(ctx: RequestContext, input: CreateExamOrder): Promise<ExamOrder> {
    const id = await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const facilityId = ctx.facilityId;
      if (!facilityId) throw AppError.validation('Selecione a unidade.');

      const patient = await tx.query<{ id: string; status: string }>(
        `SELECT id, status FROM registry.patients
          WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [input.patientId, ctx.tenantId],
      );
      if (!patient.rows[0]) throw AppError.notFound('Paciente');

      if (input.encounterId) {
        const encounter = await tx.query<{ status: string; patient_id: string }>(
          `SELECT status, patient_id FROM clinical.encounters WHERE id = $1 AND tenant_id = $2`,
          [input.encounterId, ctx.tenantId],
        );
        const enc = encounter.rows[0];
        if (!enc) throw AppError.notFound('Atendimento');
        if (enc.patient_id !== input.patientId) {
          throw AppError.validation('O atendimento informado pertence a outro paciente.');
        }
        if (enc.status === 'finished' || enc.status === 'cancelled' || enc.status === 'entered_in_error') {
          throw new AppError('ENCOUNTER_LOCKED', 'Atendimento finalizado: reabra antes de solicitar exames.');
        }
      }

      const requested = [...new Set(input.items.map((i) => i.examCatalogId))];
      const catalog = await tx.query<{ id: string; name: string; service_id: string | null }>(
        `SELECT id, name, service_id FROM lab.exam_catalog
          WHERE id = ANY($1) AND (tenant_id = $2 OR tenant_id IS NULL) AND active`,
        [requested, ctx.tenantId],
      );
      if (catalog.rows.length !== requested.length) {
        throw AppError.validation('Um ou mais exames não existem no catálogo.');
      }

      const orderId = uuidv7();
      const numberResult = await tx.query<{ next_number: string }>(
        `SELECT platform.next_number($1, 'exam_order') AS next_number`,
        [ctx.tenantId],
      );

      await tx.query(
        `INSERT INTO lab.exam_orders
           (id, tenant_id, facility_id, number, patient_id, encounter_id,
            ordered_by_professional_id, ordered_by_user_id, priority, clinical_info, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ordered')`,
        [
          orderId,
          ctx.tenantId,
          facilityId,
          numberResult.rows[0]?.next_number ?? '1',
          input.patientId,
          input.encounterId ?? null,
          ctx.professionalId,
          ctx.user.id,
          input.priority,
          input.clinicalInfo ?? null,
        ],
      );

      for (const item of input.items) {
        await tx.query(
          `INSERT INTO lab.exam_order_items
             (id, tenant_id, exam_order_id, exam_catalog_id, laboratory_id, status)
           VALUES ($1,$2,$3,$4,$5,'requested')`,
          [uuidv7(), ctx.tenantId, orderId, item.examCatalogId, item.laboratoryId ?? input.laboratoryId ?? null],
        );
      }

      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: 'exam_order.create',
        entitySchema: 'lab',
        entityTable: 'exam_orders',
        entityId: orderId,
        after: { patientId: input.patientId, items: input.items.length, priority: input.priority },
      });
      await this.audit.publish(tx, ctx, {
        aggregateTable: 'lab.exam_orders',
        aggregateId: orderId,
        eventType: 'exam_order.created',
        payload: { patientId: input.patientId, encounterId: input.encounterId ?? null },
      });

      return orderId;
    });

    return this.get(ctx, id);
  }

  async transitionItem(
    ctx: RequestContext,
    itemId: string,
    to: ExamOrderItemStatus,
    reason?: string,
  ): Promise<ExamOrder> {
    const orderId = await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query<{ status: string; exam_order_id: string }>(
        `SELECT status, exam_order_id FROM lab.exam_order_items
          WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [itemId, ctx.tenantId],
      );
      const item = rows[0];
      if (!item) throw AppError.notFound('Item do pedido');

      assertExamItemTransition(item.status as ExamOrderItemStatus, to);

      await tx.query(
        `UPDATE lab.exam_order_items
            SET status = $3,
                collected_at = CASE WHEN $3 = 'collected' THEN now() ELSE collected_at END,
                collected_by = CASE WHEN $3 = 'collected' THEN $4 ELSE collected_by END,
                sent_at = CASE WHEN $3 = 'sent' THEN now() ELSE sent_at END
          WHERE id = $1 AND tenant_id = $2`,
        [itemId, ctx.tenantId, to, ctx.user.id],
      );

      await this.refreshOrderStatus(tx, ctx, item.exam_order_id);

      await this.audit.record(tx, ctx, {
        category: 'mutation',
        action: `exam_item.${to}`,
        entitySchema: 'lab',
        entityTable: 'exam_order_items',
        entityId: itemId,
        before: { status: item.status },
        after: { status: to },
        reason: reason ?? null,
      });

      return item.exam_order_id;
    });

    return this.get(ctx, orderId);
  }

  async submitResult(ctx: RequestContext, itemId: string, input: SubmitExamResult): Promise<ExamOrder> {
    const orderId = await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query<{
        status: string;
        exam_order_id: string;
        patient_id: string;
        encounter_id: string | null;
      }>(
        `SELECT i.status, i.exam_order_id, o.patient_id, o.encounter_id
           FROM lab.exam_order_items i
           JOIN lab.exam_orders o ON o.id = i.exam_order_id AND o.tenant_id = i.tenant_id
          WHERE i.id = $1 AND i.tenant_id = $2
          FOR UPDATE OF i`,
        [itemId, ctx.tenantId],
      );
      const item = rows[0];
      if (!item) throw AppError.notFound('Item do pedido');
      if (item.status === 'cancelled') throw AppError.conflict('Item cancelado.');

      const previous = await tx.query<{ id: string; status: string }>(
        `SELECT id, status FROM lab.exam_results
          WHERE tenant_id = $1 AND exam_order_item_id = $2
            AND superseded_by_result_id IS NULL AND status <> 'entered_in_error'
          FOR UPDATE`,
        [ctx.tenantId, itemId],
      );
      const prior = previous.rows[0];
      if (prior && prior.status !== 'preliminary' && !ctx.permissions.has('exam_result:amend')) {
        throw AppError.forbidden('Retificar um resultado liberado exige a permissão de retificação.');
      }

      const resultId = uuidv7();
      const status = prior && prior.status !== 'preliminary' ? 'amended' : input.status;

      await tx.query(
        `INSERT INTO lab.exam_results
           (id, tenant_id, exam_order_item_id, patient_id, released_by, report_text, interpretation,
            report_document_id, status, supersedes_result_id, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'manual')`,
        [
          resultId,
          ctx.tenantId,
          itemId,
          item.patient_id,
          ctx.user.id,
          input.reportText ?? null,
          input.interpretation ?? null,
          input.documentId ?? null,
          status,
          prior?.id ?? null,
        ],
      );

      if (prior) {
        await tx.query(
          `UPDATE lab.exam_results SET superseded_by_result_id = $3 WHERE id = $1 AND tenant_id = $2`,
          [prior.id, ctx.tenantId, resultId],
        );
      }

      let sort = 0;
      for (const value of input.values) {
        const numeric = value.valueNumeric ?? null;
        const min = value.refMin ?? null;
        const max = value.refMax ?? null;
        let flag: string | null = null;
        if (numeric !== null && (min !== null || max !== null)) {
          if (min !== null && numeric < min) flag = 'low';
          else if (max !== null && numeric > max) flag = 'high';
          else flag = 'normal';
        }

        await tx.query(
          `INSERT INTO lab.exam_result_values
             (id, tenant_id, exam_result_id, analyte_code, analyte_name, value_numeric, value_text,
              uom, ref_min, ref_max, abnormal_flag, sort)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            uuidv7(),
            ctx.tenantId,
            resultId,
            value.analyteCode,
            value.analyteName,
            numeric,
            value.valueText ?? null,
            value.uom ?? null,
            min,
            max,
            flag,
            sort,
          ],
        );
        sort += 1;
      }

      await tx.query(`UPDATE lab.exam_order_items SET status = 'resulted' WHERE id = $1 AND tenant_id = $2`, [
        itemId,
        ctx.tenantId,
      ]);
      await this.refreshOrderStatus(tx, ctx, item.exam_order_id);

      await this.audit.record(tx, ctx, {
        category: 'sign',
        action: prior ? 'exam_result.amend' : 'exam_result.submit',
        entitySchema: 'lab',
        entityTable: 'exam_results',
        entityId: resultId,
        after: { itemId, status, values: input.values.length, supersedes: prior?.id ?? null },
      });
      await this.audit.publish(tx, ctx, {
        aggregateTable: 'lab.exam_results',
        aggregateId: resultId,
        eventType: 'exam_result.released',
        payload: { patientId: item.patient_id, encounterId: item.encounter_id },
      });

      return item.exam_order_id;
    });

    return this.get(ctx, orderId);
  }

  async reviewResult(ctx: RequestContext, resultId: string): Promise<ExamOrder> {
    const orderId = await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query<{ exam_order_item_id: string; status: string; exam_order_id: string }>(
        `SELECT r.exam_order_item_id, r.status, i.exam_order_id
           FROM lab.exam_results r
           JOIN lab.exam_order_items i ON i.id = r.exam_order_item_id AND i.tenant_id = r.tenant_id
          WHERE r.id = $1 AND r.tenant_id = $2
          FOR UPDATE OF r`,
        [resultId, ctx.tenantId],
      );
      const result = rows[0];
      if (!result) throw AppError.notFound('Resultado');
      if (result.status === 'preliminary') {
        throw AppError.validation('Resultado preliminar não pode ser revisado. Aguarde o resultado final.');
      }

      await tx.query(
        `UPDATE lab.exam_results SET reviewed_by = $3, reviewed_at = now()
          WHERE id = $1 AND tenant_id = $2 AND reviewed_at IS NULL`,
        [resultId, ctx.tenantId, ctx.user.id],
      );
      await tx.query(`UPDATE lab.exam_order_items SET status = 'reviewed' WHERE id = $1 AND tenant_id = $2`, [
        result.exam_order_item_id,
        ctx.tenantId,
      ]);
      await this.refreshOrderStatus(tx, ctx, result.exam_order_id);

      await this.audit.record(tx, ctx, {
        category: 'sign',
        action: 'exam_result.review',
        entitySchema: 'lab',
        entityTable: 'exam_results',
        entityId: resultId,
      });

      return result.exam_order_id;
    });

    return this.get(ctx, orderId);
  }

  async cancel(ctx: RequestContext, orderId: string, reason: string): Promise<ExamOrder> {
    await this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query<{ status: string }>(
        `SELECT status FROM lab.exam_orders WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [orderId, ctx.tenantId],
      );
      const order = rows[0];
      if (!order) throw AppError.notFound('Pedido de exame');
      if (order.status === 'reviewed' || order.status === 'resulted') {
        throw AppError.conflict('Pedido já resultado não pode ser cancelado.');
      }

      await tx.query(
        `UPDATE lab.exam_order_items SET status = 'cancelled'
          WHERE tenant_id = $1 AND exam_order_id = $2 AND status NOT IN ('resulted', 'reviewed', 'cancelled')`,
        [ctx.tenantId, orderId],
      );
      await tx.query(
        `UPDATE lab.exam_orders
            SET status = 'cancelled', cancel_reason = $3, row_version = row_version + 1, updated_at = now()
          WHERE id = $1 AND tenant_id = $2`,
        [orderId, ctx.tenantId, reason],
      );

      await this.audit.record(tx, ctx, {
        category: 'cancel',
        action: 'exam_order.cancel',
        entitySchema: 'lab',
        entityTable: 'exam_orders',
        entityId: orderId,
        reason,
      });
    });

    return this.get(ctx, orderId);
  }

  private async refreshOrderStatus(tx: Queryable, ctx: RequestContext, orderId: string): Promise<void> {
    const { rows } = await tx.query<{ status: string }>(
      `SELECT status FROM lab.exam_order_items WHERE tenant_id = $1 AND exam_order_id = $2`,
      [ctx.tenantId, orderId],
    );
    const aggregated = aggregateExamOrderStatus(rows.map((r) => r.status as ExamOrderItemStatus));
    await tx.query(
      `UPDATE lab.exam_orders SET status = $3, updated_at = now(), row_version = row_version + 1
        WHERE id = $1 AND tenant_id = $2 AND status <> $3`,
      [orderId, ctx.tenantId, aggregated],
    );
  }

  async laboratories(ctx: RequestContext) {
    return this.db.withTenant(contextToTenantContext(ctx), async (tx) => {
      const { rows } = await tx.query(
        `SELECT id, name, is_internal AS "isInternal", active
           FROM lab.laboratories
          WHERE tenant_id = $1 AND deleted_at IS NULL AND active
          ORDER BY is_internal DESC, name`,
        [ctx.tenantId],
      );
      return { items: rows };
    });
  }
}
