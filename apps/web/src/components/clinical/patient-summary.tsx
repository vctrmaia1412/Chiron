'use client';

import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarClock, Check, ChevronDown, ClipboardList, Pill, Syringe } from 'lucide-react';
import type { PatientProblem } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { usePatientSummary } from '@/lib/charting';
import { formatDate, formatDateShort, relativeTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Card, Skeleton } from '@/components/ui/primitives';

/**
 * O que o veterinário precisa saber antes de escrever a primeira linha, num
 * cartão só: o que está em aberto, o que o animal toma, o que foi decidido da
 * última vez e o que está vencendo. No celular começa recolhido numa linha que
 * já diz quantos itens tem, para não empurrar o registro para baixo.
 */
export function PatientSummaryCard({
  patientId,
  encounterId,
  canEditProblems,
}: {
  patientId: string;
  encounterId: string;
  canEditProblems: boolean;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading } = usePatientSummary(patientId, encounterId);

  const resolve = useMutation({
    mutationFn: (problem: PatientProblem) =>
      api.patch(`/patients/${patientId}/problems/${problem.id}`, { status: 'resolved' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['patient-summary', patientId] });
      toast.success('Problema marcado como resolvido.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (isLoading || !data) {
    return (
      <Card className="space-y-2 p-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-12 w-full" />
      </Card>
    );
  }

  const overdue = data.dueImmunizations.filter((item) => item.overdue).length;
  const headline = [
    data.problems.length ? `${data.problems.length} problema${data.problems.length > 1 ? 's' : ''}` : null,
    data.activeMedications.length
      ? `${data.activeMedications.length} em uso`
      : null,
    overdue ? `${overdue} vacina${overdue > 1 ? 's' : ''} vencida${overdue > 1 ? 's' : ''}` : null,
    data.encounterCount === 0 ? 'primeira consulta' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Card>
      <details className="group" open>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold text-[var(--ink)]">Resumo do paciente</span>
            <span className={cn('block truncate text-[12.5px]', overdue ? 'text-[var(--danger)]' : 'text-[var(--ink-3)]')}>
              {headline || 'Nada em aberto'}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-[var(--ink-3)] transition-transform group-open:rotate-180" />
        </summary>

        <div className="space-y-4 border-t border-[var(--border)] px-4 py-3">
          {data.problems.length > 0 && (
            <section>
              <h4 className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                <ClipboardList className="h-3.5 w-3.5" />
                Problemas
              </h4>
              <ul className="flex flex-wrap gap-1.5">
                {data.problems.map((problem) => (
                  <li
                    key={problem.id}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full py-1 pl-2.5 pr-1 text-[12.5px] font-medium',
                      problem.status === 'chronic'
                        ? 'bg-[var(--warning-soft)] text-[var(--warning)]'
                        : 'bg-[var(--surface-3)] text-[var(--ink-2)]',
                    )}
                  >
                    {problem.description}
                    {problem.status === 'chronic' && <span className="font-normal opacity-80">· crônico</span>}
                    {canEditProblems && (
                      <button
                        type="button"
                        onClick={() => resolve.mutate(problem)}
                        title="Marcar como resolvido"
                        aria-label={`Marcar ${problem.description} como resolvido`}
                        className="ml-0.5 rounded-full p-1 hover:bg-black/5"
                      >
                        <Check className="h-3 w-3" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.activeMedications.length > 0 && (
            <section>
              <h4 className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                <Pill className="h-3.5 w-3.5" />
                Em uso
              </h4>
              <ul className="space-y-1">
                {data.activeMedications.map((medication, index) => (
                  <li key={`${medication.prescriptionId}-${index}`} className="text-[13.5px] leading-snug">
                    <span className="font-medium text-[var(--ink)]">{medication.drugName}</span>
                    {medication.posology && <span className="text-[var(--ink-2)]"> · {medication.posology}</span>}
                    <span className="text-[var(--ink-3)]">
                      {medication.continuous ? ' · uso contínuo' : medication.until ? ` · até ${formatDateShort(medication.until)}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.lastEncounter && (
            <section>
              <h4 className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                <CalendarClock className="h-3.5 w-3.5" />
                Última consulta
              </h4>
              <Link
                href={`/atendimentos/${data.lastEncounter.id}`}
                className="block rounded-[var(--radius)] bg-[var(--surface-2)] px-3 py-2 hover:bg-[var(--surface-3)]"
              >
                <p className="text-[12.5px] text-[var(--ink-3)]">
                  {relativeTime(data.lastEncounter.occurredAt)} · {formatDate(data.lastEncounter.occurredAt)}
                  {data.lastEncounter.serviceName ? ` · ${data.lastEncounter.serviceName}` : ''}
                  {data.lastEncounter.professionalName ? ` · ${data.lastEncounter.professionalName}` : ''}
                </p>
                {data.lastEncounter.diagnosisSummary && (
                  <p className="mt-0.5 text-[13.5px] font-medium text-[var(--ink)]">{data.lastEncounter.diagnosisSummary}</p>
                )}
                {data.lastEncounter.plan && (
                  <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-[13px] text-[var(--ink-2)]">
                    {data.lastEncounter.plan}
                  </p>
                )}
              </Link>
            </section>
          )}

          {data.dueImmunizations.length > 0 && (
            <section>
              <h4 className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                <Syringe className="h-3.5 w-3.5" />
                Vacinas e preventivos
              </h4>
              <ul className="flex flex-wrap gap-1.5">
                {data.dueImmunizations.map((item) => (
                  <li
                    key={`${item.kind}-${item.name}`}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-[12.5px] font-medium',
                      item.overdue ? 'bg-[var(--danger-soft)] text-[var(--danger)]' : 'bg-[var(--info-soft)] text-[var(--info)]',
                    )}
                  >
                    {item.name} · {item.overdue ? 'venceu' : 'vence'} {formatDateShort(item.dueAt)}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!data.problems.length && !data.activeMedications.length && !data.lastEncounter && !data.dueImmunizations.length && (
            <p className="text-[13px] text-[var(--ink-3)]">Sem histórico clínico registrado. Primeira consulta.</p>
          )}
        </div>
      </details>
    </Card>
  );
}
