'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, Users } from 'lucide-react';
import type { Guardian } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { formatPhone } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Card, EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { GuardianFormSheet } from '@/components/guardians/guardian-form';

export default function GuardiansPage() {
  const { can } = useSession();
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(timer);
  }, [term]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['guardians', debounced],
    queryFn: () => api.get<{ items: Guardian[] }>('/guardians', { q: debounced || undefined, limit: 50 }),
  });

  const items = data?.items ?? [];

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

      <Card>
        {error ? (
          <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <ListSkeleton rows={6} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Users className="h-7 w-7" />}
            title={debounced ? 'Nenhum tutor encontrado' : 'Nenhum tutor cadastrado'}
            action={
              can('guardian:create') && !debounced ? (
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
                    <span className="block truncate text-[15px] font-medium text-[var(--ink)]">{guardian.name}</span>
                    <span className="block truncate text-[12.5px] text-[var(--ink-3)]">
                      {[formatPhone(guardian.phonePrimary), guardian.email, guardian.documentMasked]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-[12px] text-[var(--ink-3)]">
                    {guardian.patientCount === 1 ? '1 paciente' : `${guardian.patientCount} pacientes`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <GuardianFormSheet open={formOpen} onOpenChange={setFormOpen} />
    </>
  );
}
