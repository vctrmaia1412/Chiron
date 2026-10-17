'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, ClipboardCheck, FileText, Send, TestTube, XCircle } from 'lucide-react';
import type { ExamOrder, ExamOrderItem } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { openDocument } from '@/lib/documents';
import { formatDateTime, formatNumber } from '@/lib/format';
import { ABNORMAL_FLAG, EXAM_ITEM_STATUS, EXAM_ORDER_STATUS, statusFor } from '@/lib/labels';
import { useSession } from '@/lib/session';
import { Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Field, Textarea } from '@/components/ui/field';
import { ExamResultSheet } from './exam-result-sheet';

export function ExamOrderCard({
  order,
  showPatient,
  hideHeader,
}: {
  order: ExamOrder;
  showPatient?: boolean;
  /** Dentro de uma linha que já mostra número, situação e data. */
  hideHeader?: boolean;
}) {
  const queryClient = useQueryClient();
  const { can } = useSession();
  const [resultTarget, setResultTarget] = useState<ExamOrderItem | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  // Pedido sem nenhum resultado ainda pode ser cancelado (pedido errado, tutor desistiu).
  const canCancel =
    can('exam_order:cancel') && !['resulted', 'reviewed', 'cancelled'].includes(order.status);

  const status = statusFor(EXAM_ORDER_STATUS, order.status);

  const transition = useMutation({
    mutationFn: ({ itemId, next }: { itemId: string; next: string }) =>
      api.post(`/exam-orders/items/${itemId}/transition`, { status: next }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['exam-orders'] });
      toast.success('Situação atualizada.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const review = useMutation({
    mutationFn: (resultId: string) => api.post(`/exam-orders/results/${resultId}/review`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['exam-orders'] });
      toast.success('Resultado revisado.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const cancel = useMutation({
    mutationFn: () => api.post(`/exam-orders/${order.id}/cancel`, { reason: cancelReason.trim() }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['exam-orders'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Pedido de exame cancelado.');
      setCancelOpen(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <>
      <article className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]">
        <header
          className={`flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-3.5 py-2.5 ${hideHeader ? 'hidden' : ''}`}
        >
          <span className="text-[13px] font-semibold text-[var(--ink)] tabular">Pedido nº {order.number}</span>
          <Badge tone={status.tone}>{status.label}</Badge>
          {order.priority !== 'routine' && (
            <Badge tone={order.priority === 'stat' ? 'danger' : 'warning'}>
              {order.priority === 'stat' ? 'Imediato' : 'Urgente'}
            </Badge>
          )}
          {showPatient && (
            <Link
              href={`/pacientes/${order.patient.id}`}
              className="text-[13px] font-medium text-[var(--brand)] hover:underline"
            >
              {order.patient.name}
            </Link>
          )}
          <span className="ml-auto text-[12px] text-[var(--ink-3)]">{formatDateTime(order.orderedAt)}</span>
        </header>

        {order.clinicalInfo && (
          <p className="border-b border-[var(--border)] px-3.5 py-2 text-[13px] text-[var(--ink-2)]">
            {order.clinicalInfo}
          </p>
        )}

        <ul className="divide-y divide-[var(--border)]">
          {order.items.map((item) => {
            const itemStatus = statusFor(EXAM_ITEM_STATUS, item.status);
            return (
              <li key={item.id} className="px-3.5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-medium text-[var(--ink)]">{item.examName}</span>
                  <Badge tone={itemStatus.tone}>{itemStatus.label}</Badge>
                  {item.laboratoryName && (
                    <span className="text-[12px] text-[var(--ink-3)]">{item.laboratoryName}</span>
                  )}
                </div>

                {item.result && (
                  <div className="mt-2 rounded-[var(--radius)] bg-[var(--surface-2)] px-3 py-2.5">
                    {item.result.values.length > 0 && (
                      <table className="w-full text-[13px]">
                        <tbody>
                          {item.result.values.map((value) => {
                            const flag = value.abnormalFlag ? statusFor(ABNORMAL_FLAG, value.abnormalFlag) : null;
                            return (
                              <tr key={value.id} className="border-b border-[var(--border)] last:border-0">
                                <td className="py-1 pr-2 text-[var(--ink-2)]">{value.analyteName}</td>
                                <td className="py-1 pr-2 text-right font-medium tabular text-[var(--ink)]">
                                  {value.valueNumeric ? formatNumber(value.valueNumeric, 2) : value.valueText}
                                  {value.uom ? ` ${value.uom}` : ''}
                                </td>
                                <td className="w-20 py-1 text-right text-[12px] text-[var(--ink-3)] tabular">
                                  {value.refMin && value.refMax
                                    ? `${formatNumber(value.refMin, 1)}–${formatNumber(value.refMax, 1)}`
                                    : ''}
                                </td>
                                <td className="w-16 py-1 pl-2 text-right">
                                  {flag && flag.label !== 'Normal' && (
                                    <Badge tone={flag.tone}>{flag.label}</Badge>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}

                    {item.result.interpretation && (
                      <p className="mt-2 text-[13px] text-[var(--ink-2)]">{item.result.interpretation}</p>
                    )}
                    {item.result.reportText && (
                      <p className="mt-1 whitespace-pre-wrap text-[12.5px] text-[var(--ink-3)]">
                        {item.result.reportText}
                      </p>
                    )}
                    {item.result.documentId && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="mt-2"
                        onClick={() => {
                          openDocument(item.result!.documentId!).catch((error) => toast.error(errorMessage(error)));
                        }}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Ver laudo
                      </Button>
                    )}
                    <p className="mt-1.5 text-[11.5px] text-[var(--ink-3)]">
                      Liberado em {formatDateTime(item.result.releasedAt)}
                      {item.result.releasedByName ? ` por ${item.result.releasedByName}` : ''}
                      {item.result.reviewedAt
                        ? ` · revisado em ${formatDateTime(item.result.reviewedAt)}`
                        : ''}
                    </p>
                  </div>
                )}

                <div className="mt-2 flex flex-wrap gap-2">
                  {item.status === 'requested' && can('exam:collect') && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => transition.mutate({ itemId: item.id, next: 'collected' })}
                    >
                      <TestTube className="h-3.5 w-3.5" />
                      Registrar coleta
                    </Button>
                  )}
                  {item.status === 'collected' && can('exam:collect') && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => transition.mutate({ itemId: item.id, next: 'sent' })}
                    >
                      <Send className="h-3.5 w-3.5" />
                      Marcar como enviado
                    </Button>
                  )}
                  {/* Sem resultado ou preliminar: lança. Liberado ou já revisado: só
                      quem pode retificar, e a versão anterior continua registrada. */}
                  {item.status !== 'cancelled' &&
                    (item.result && item.result.status !== 'preliminary'
                      ? can('exam_result:amend')
                      : can('exam_result:submit')) && (
                      <Button
                        size="sm"
                        variant={item.result && item.result.status !== 'preliminary' ? 'ghost' : 'primary'}
                        onClick={() => setResultTarget(item)}
                      >
                        <ClipboardCheck className="h-3.5 w-3.5" />
                        {item.result ? 'Retificar resultado' : 'Lançar resultado'}
                      </Button>
                    )}
                  {item.result && item.status === 'resulted' && can('exam_result:sign') && (
                    <Button size="sm" variant="secondary" onClick={() => review.mutate(item.result!.id)}>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Revisar
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {canCancel && (
          <div className="border-t border-[var(--border)] px-3.5 py-2">
            <Button size="sm" variant="ghost" onClick={() => setCancelOpen(true)}>
              <XCircle className="h-3.5 w-3.5" />
              Cancelar pedido
            </Button>
          </div>
        )}
      </article>

      <ExamResultSheet
        item={resultTarget}
        orderId={order.id}
        patientId={order.patient.id}
        onClose={() => setResultTarget(null)}
      />

      <Sheet
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancelar pedido de exame"
        description={`Pedido nº ${order.number} · ${order.items.map((entry) => entry.examName).join(', ')}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)} className="sm:w-auto">
              Voltar
            </Button>
            <Button
              variant="danger"
              disabled={cancelReason.trim().length < 3}
              loading={cancel.isPending}
              onClick={() => cancel.mutate()}
              className="sm:w-auto"
            >
              Cancelar pedido
            </Button>
          </>
        }
      >
        <Field label="Motivo" required hint="Fica no histórico do paciente e na auditoria.">
          <Textarea
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            rows={2}
            placeholder="Ex.: pedido em duplicidade"
          />
        </Field>
      </Sheet>
    </>
  );
}
