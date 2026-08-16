'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Plus, Stethoscope } from 'lucide-react';
import type { EncounterSummary } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, relativeTime } from '@/lib/format';
import { ENCOUNTER_CLASS, ENCOUNTER_STATUS, labelFor, statusFor } from '@/lib/labels';
import { useSession } from '@/lib/session';
import { Badge, Card, EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { FilterChips } from '@/components/ui/tabs';
import { WalkInSheet } from '@/components/clinical/walk-in-sheet';

const FILTERS = [
  { key: 'abertos', label: 'Em aberto' },
  { key: 'aguardando', label: 'Aguardando' },
  { key: 'andamento', label: 'Em atendimento' },
  { key: 'finalizados', label: 'Finalizados' },
  { key: 'todos', label: 'Todos' },
];

function EncountersList() {
  const router = useRouter();
  const params = useSearchParams();
  const { can } = useSession();
  const [filter, setFilter] = useState('abertos');
  const [walkInOpen, setWalkInOpen] = useState(false);

  useEffect(() => {
    const preset = params.get('filtro');
    if (preset && FILTERS.some((item) => item.key === preset)) setFilter(preset);
  }, [params]);

  const query = (() => {
    switch (filter) {
      case 'aguardando':
        return { status: 'arrived' as const };
      case 'andamento':
        return { status: 'in_progress' as const };
      case 'finalizados':
        return { status: 'finished' as const };
      case 'todos':
        return {};
      default:
        return { open: true };
    }
  })();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['encounters', filter],
    queryFn: () => api.get<{ items: EncounterSummary[] }>('/encounters', { ...query, limit: 60 }),
    refetchInterval: filter === 'finalizados' || filter === 'todos' ? false : 45_000,
  });

  const items = data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Atendimentos"
        description="Fila de espera e atendimentos em curso."
        actions={
          can('encounter:create') ? (
            <Button size="sm" onClick={() => setWalkInOpen(true)}>
              <Plus className="h-4 w-4" />
              Atendimento sem agenda
            </Button>
          ) : undefined
        }
      />

      <FilterChips className="mb-3" value={filter} onChange={setFilter} items={FILTERS} />

      <Card>
        {error ? (
          <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <ListSkeleton rows={5} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="h-7 w-7" />}
            title="Nenhum atendimento nesta lista"
            description="Faça o check-in de um agendamento ou abra um atendimento sem agenda."
            action={
              can('encounter:create') ? (
                <Button onClick={() => setWalkInOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Atendimento sem agenda
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {items.map((encounter) => {
              const status = statusFor(ENCOUNTER_STATUS, encounter.status);
              const reference = encounter.endedAt ?? encounter.startedAt ?? encounter.arrivedAt ?? encounter.createdAt;
              return (
                <li key={encounter.id}>
                  <Link
                    href={`/atendimentos/${encounter.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--surface-2)]"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-3)] text-[var(--ink-3)]">
                      <Stethoscope className="h-4 w-4" />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-[15px] font-medium text-[var(--ink)]">
                          {encounter.patient.name}
                        </span>
                        <Badge tone={status.tone} dot={encounter.status === 'in_progress'}>
                          {status.label}
                        </Badge>
                      </span>
                      <span className="block truncate text-[12.5px] text-[var(--ink-3)]">
                        {[
                          encounter.patient.speciesName,
                          encounter.serviceName ?? labelFor(ENCOUNTER_CLASS, encounter.class),
                          encounter.attendingProfessional?.name,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      {encounter.chiefComplaint && (
                        <span className="block truncate text-[13px] text-[var(--ink-2)]">
                          {encounter.chiefComplaint}
                        </span>
                      )}
                    </span>

                    <span className="hidden shrink-0 text-right text-[12px] text-[var(--ink-3)] sm:block">
                      <span className="block tabular">{relativeTime(reference)}</span>
                      <span className="block">{formatDateTime(reference)}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <WalkInSheet
        open={walkInOpen}
        onOpenChange={setWalkInOpen}
        onCreated={(encounterId) => router.push(`/atendimentos/${encounterId}`)}
      />
    </>
  );
}

export default function EncountersPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={6} />}>
      <EncountersList />
    </Suspense>
  );
}
