'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import type { EncounterSummary } from '@chiron/contracts';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';

/**
 * Atalho de volta para a consulta em andamento. O veterinário sai do
 * atendimento para conferir um exame, a agenda ou outro paciente, e de
 * qualquer tela volta com um toque, sem procurar na fila. Fica logo acima
 * da barra inferior no celular e no canto da tela no computador.
 */
export function ActiveEncounterPill() {
  const pathname = usePathname();
  const { context, can, hasModule } = useSession();
  const professionalId = context?.membership?.professionalId ?? null;
  const enabled = Boolean(professionalId) && hasModule('clinical') && can('encounter:read');

  const { data } = useQuery({
    queryKey: ['encounters', 'active-mine', professionalId],
    queryFn: () =>
      api.get<{ items: EncounterSummary[] }>('/encounters', {
        status: 'in_progress',
        professionalId: professionalId ?? undefined,
        limit: 3,
      }),
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  // Dentro de um atendimento a barra inferior já é dele; o atalho para outra
  // consulta em andamento só cobriria o texto que está sendo escrito.
  const insideEncounter = /^\/atendimentos\/[^/]+$/.test(pathname);
  const active = data?.items ?? [];
  const first = active[0];
  if (!enabled || insideEncounter || !first) return null;

  return (
    // Grudado no rodapé dentro do conteúdo: ocupa o próprio espaço no fim da
    // página, então nunca cobre o último item de uma lista.
    <div className="pointer-events-none sticky bottom-[calc(var(--mobilenav-h)+env(safe-area-inset-bottom)+10px)] z-20 mt-4 flex justify-center lg:fixed lg:bottom-6 lg:right-6 lg:mt-0 lg:justify-end">
      <Link
        href={`/atendimentos/${first.id}`}
        className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full bg-[var(--brand)] py-2.5 pl-3.5 pr-3 text-[13.5px] font-medium text-white shadow-[var(--shadow-lg)] active:bg-[var(--brand-hover)]"
      >
        <span className="h-2 w-2 shrink-0 animate-soft-pulse rounded-full bg-white" aria-hidden />
        <span className="truncate">
          Em atendimento: <strong className="font-semibold">{first.patient.name}</strong>
          {active.length > 1 ? ` e mais ${active.length - 1}` : ''}
        </span>
        <span className="flex shrink-0 items-center gap-0.5 font-semibold">
          voltar
          <ArrowRight className="h-4 w-4" />
        </span>
      </Link>
    </div>
  );
}
