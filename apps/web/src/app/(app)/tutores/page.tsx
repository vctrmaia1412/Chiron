'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Plus, Search, Users } from 'lucide-react';
import type { Guardian } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { formatPhone } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Badge, Card, EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { FilterChips } from '@/components/ui/tabs';
import { GuardianFormSheet } from '@/components/guardians/guardian-form';

const PAGE_SIZE = 30;

export default function GuardiansPage() {
  const { can } = useSession();
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('active');
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(timer);
  }, [term]);

  const { data, isLoading, error, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['guardians', { debounced, status }],
    queryFn: ({ pageParam }) =>
      api.get<{ items: Guardian[]; nextCursor: string | null }>('/guardians', {
        q: debounced || undefined,
        status: status === 'all' ? undefined : status,
        limit: PAGE_SIZE,
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });

  const items = data?.pages.flatMap((page) => page.items) ?? [];
  const filtered = Boolean(debounced) || status !== 'active';

  return (
    <>
      <PageHeader
        title="Tutores"
        description="Responsáveis pelos pacientes, com dados pessoais protegidos."
        actions={
          can('guardian:create') ? (
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" />
              Novo tutor
            </Button>
          ) : undefined
        }
      />

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-3)]" />
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Nome, telefone, e-mail ou CPF"
          className="pl-9"
          inputMode="search"
        />
      </div>

      <FilterChips
        className="mb-3"
        value={status}
        onChange={setStatus}
        items={[
          { key: 'active', label: 'Ativos' },
          { key: 'inactive', label: 'Inativos' },
          { key: 'all', label: 'Todos' },
        ]}
      />

      <Card>
        {error ? (
          <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <ListSkeleton rows={6} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Users className="h-7 w-7" />}
            title={filtered ? 'Nenhum tutor encontrado' : 'Nenhum tutor cadastrado'}
            description={filtered ? 'Ajuste a busca ou o filtro.' : undefined}
            action={
              can('guardian:create') && !filtered ? (
                <Button onClick={() => setFormOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Novo tutor
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {items.map((guardian) => (
              <li key={guardian.id}>
                <Link
                  href={`/tutores/${guardian.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--surface-2)]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[15px] font-medium text-[var(--ink)]">{guardian.name}</span>
                      {guardian.inactiveAt && (
                        <Badge tone="muted" className="shrink-0">
                          Inativo
                        </Badge>
                      )}
                    </span>
                    <span className="block truncate text-[12.5px] text-[var(--ink-3)]">
                      {[formatPhone(guardian.phonePrimary), guardian.email, guardian.documentMasked]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-[12px] text-[var(--ink-3)]">
                    {guardian.patientCount === 1 ? '1 paciente' : `${guardian.patientCount ?? 0} pacientes`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {hasNextPage && (
        <Button
          variant="secondary"
          block
          className="mt-3"
          onClick={() => void fetchNextPage()}
          loading={isFetchingNextPage}
        >
          Carregar mais
        </Button>
      )}

      <GuardianFormSheet open={formOpen} onOpenChange={setFormOpen} />
    </>
  );
}
