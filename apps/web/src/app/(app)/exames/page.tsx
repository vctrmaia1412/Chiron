'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { FlaskConical, Search } from 'lucide-react';
import type { ExamOrder, Patient } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { useDebounced } from '@/lib/use-debounced';
import { Card, EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { FilterChips } from '@/components/ui/tabs';
import { ExamOrderRow } from '@/components/lab/exam-order-row';

const PAGE = 20;

/**
 * Pedidos em linhas compactas, com busca pelo nome do paciente e carga em
 * blocos de vinte. Tocar no pedido abre resultados e ações no lugar. A lista
 * cabe na tela do celular em vez de virar dezenas de telas de cartões.
 */
function ExamsList() {
  const params = useSearchParams();
  const patientId = params.get('pacienteId') ?? undefined;
  const [filter, setFilter] = useState(params.get('pendentes') ? 'pendentes' : patientId ? 'todos' : 'pendentes');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const q = useDebounced(search.trim(), 300);

  const query = (() => {
    switch (filter) {
      case 'pendentes':
        return { pending: true };
      case 'solicitados':
        return { status: 'ordered' };
      case 'resultado':
        return { status: 'resulted' };
      case 'revisados':
        return { status: 'reviewed' };
      default:
        return {};
    }
  })();

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['exam-orders', 'list', filter, patientId, q, limit],
    queryFn: () =>
      api.get<{ items: ExamOrder[] }>('/exam-orders', { ...query, patientId, q: q || undefined, limit }),
    placeholderData: (previous) => previous,
  });

  // Vindo da ficha: a lista é de um paciente só, e o caminho de volta é a ficha.
  const { data: patient } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => api.get<Patient>(`/patients/${patientId}`),
    enabled: Boolean(patientId),
  });

  const items = data?.items ?? [];
  const mayHaveMore = items.length >= limit;

  return (
    <>
      <PageHeader
        title={patient ? `Exames de ${patient.name}` : 'Exames'}
        description="Pedidos, coletas e resultados. Toque num pedido para ver o resultado."
        back={patientId ? { href: `/pacientes/${patientId}`, label: patient?.name ?? 'Ficha do paciente' } : undefined}
      />

      {!patientId && (
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-3)]" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setLimit(PAGE);
            }}
            placeholder="Buscar pelo nome do paciente"
            aria-label="Buscar pelo nome do paciente"
            className="pl-9"
          />
        </div>
      )}

      <FilterChips
        className="mb-3"
        value={filter}
        onChange={(next) => {
          setFilter(next);
          setLimit(PAGE);
        }}
        items={[
          { key: 'pendentes', label: 'Pendentes' },
          { key: 'solicitados', label: 'Solicitados' },
          { key: 'resultado', label: 'Com resultado' },
          { key: 'revisados', label: 'Revisados' },
          { key: 'todos', label: 'Todos' },
        ]}
      />

      {error ? (
        <Card>
          <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
        </Card>
      ) : isLoading ? (
        <Card>
          <ListSkeleton rows={4} />
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FlaskConical className="h-7 w-7" />}
            title={q ? `Nenhum pedido para "${q}"` : 'Nenhum pedido nesta lista'}
            description="Os exames são solicitados dentro do atendimento."
          />
        </Card>
      ) : (
        <>
          <ul className="space-y-2">
            {items.map((order) => (
              <ExamOrderRow key={order.id} order={order} showPatient={!patientId} defaultOpen={Boolean(patientId) && items.length === 1} />
            ))}
          </ul>
          {mayHaveMore && (
            <Button
              variant="secondary"
              block
              className="mt-3"
              loading={isFetching}
              onClick={() => setLimit((current) => current + PAGE)}
            >
              Carregar mais
            </Button>
          )}
        </>
      )}
    </>
  );
}

export default function ExamsPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={5} />}>
      <ExamsList />
    </Suspense>
  );
}
