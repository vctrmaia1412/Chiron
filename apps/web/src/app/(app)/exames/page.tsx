'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { FlaskConical } from 'lucide-react';
import type { ExamOrder } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { Card, EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/ui/primitives';
import { FilterChips } from '@/components/ui/tabs';
import { ExamOrderCard } from '@/components/lab/exam-order-card';

function ExamsList() {
  const params = useSearchParams();
  const patientId = params.get('pacienteId') ?? undefined;
  const [filter, setFilter] = useState(params.get('pendentes') ? 'pendentes' : 'todos');

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

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['exam-orders', 'list', filter, patientId],
    queryFn: () => api.get<{ items: ExamOrder[] }>('/exam-orders', { ...query, patientId, limit: 60 }),
  });

  const items = data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Exames"
        description="Pedidos, coletas e resultados. Resultado liberado não é sobrescrito: retificação cria nova versão."
      />

      <FilterChips
        className="mb-3"
        value={filter}
        onChange={setFilter}
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
            title="Nenhum pedido nesta lista"
            description="Os exames são solicitados dentro do atendimento."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((order) => (
            <ExamOrderCard key={order.id} order={order} showPatient />
          ))}
        </div>
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
