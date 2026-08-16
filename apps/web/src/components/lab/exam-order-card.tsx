'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, ClipboardCheck, Send, TestTube } from 'lucide-react';
import type { ExamOrder, ExamOrderItem } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, formatNumber } from '@/lib/format';
import { ABNORMAL_FLAG, EXAM_ITEM_STATUS, EXAM_ORDER_STATUS, statusFor } from '@/lib/labels';
import { useSession } from '@/lib/session';
import { Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { ExamResultSheet } from './exam-result-sheet';

export function ExamOrderCard({ order, showPatient }: { order: ExamOrder; showPatient?: boolean }) {
  const queryClient = useQueryClient();
  const { can } = useSession();
  const [resultTarget, setResultTarget] = useState<ExamOrderItem | null>(null);

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

  return (
    <>
      <article className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]">
        <header className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-3.5 py-2.5">
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
                  {['requested', 'collected', 'sent', 'in_progress', 'resulted'].includes(item.status) &&
                    can('exam_result:submit') && (
                      <Button size="sm" onClick={() => setResultTarget(item)}>
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
      </article>

      <ExamResultSheet item={resultTarget} onClose={() => setResultTarget(null)} />
    </>
  );
}
