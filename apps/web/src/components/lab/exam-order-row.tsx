'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ExamOrder } from '@chiron/contracts';
import { formatDateShort } from '@/lib/format';
import { EXAM_ORDER_STATUS, statusFor } from '@/lib/labels';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/primitives';
import { ExamOrderCard } from './exam-order-card';

/**
 * Pedido de exame em uma linha: paciente, exames, situação e data. Tocar
 * abre o pedido completo, com resultados e ações, no mesmo lugar. Numa lista
 * de dezenas de pedidos, o celular mostra o que procurar em vez de uma
 * parede de cartões.
 */
export function ExamOrderRow({
  order,
  showPatient,
  defaultOpen = false,
}: {
  order: ExamOrder;
  showPatient?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const status = statusFor(EXAM_ORDER_STATUS, order.status);
  const withResult = order.items.filter((item) => item.result).length;
  const abnormal = order.items.some((item) =>
    item.result?.values.some((value) => value.abnormalFlag && value.abnormalFlag !== 'normal'),
  );

  return (
    <li className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-start gap-3 px-3.5 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            {showPatient && <span className="text-[14.5px] font-semibold text-[var(--ink)]">{order.patient.name}</span>}
            <Badge tone={status.tone}>{status.label}</Badge>
            {order.priority !== 'routine' && (
              <Badge tone={order.priority === 'stat' ? 'danger' : 'warning'}>
                {order.priority === 'stat' ? 'Imediato' : 'Urgente'}
              </Badge>
            )}
            {abnormal && <Badge tone="danger">Alterado</Badge>}
          </span>
          <span className="mt-0.5 block truncate text-[13.5px] text-[var(--ink-2)]">
            {order.items.map((item) => item.examName).join(', ')}
          </span>
          <span className="block text-[12px] text-[var(--ink-3)]">
            {formatDateShort(order.orderedAt)} · pedido nº {order.number}
            {withResult > 0 ? ` · ${withResult} de ${order.items.length} com resultado` : ''}
          </span>
        </span>
        <ChevronDown
          className={cn('mt-1 h-4 w-4 shrink-0 text-[var(--ink-3)] transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="border-t border-[var(--border)] p-2">
          <ExamOrderCard order={order} showPatient={showPatient} hideHeader />
        </div>
      )}
    </li>
  );
}
