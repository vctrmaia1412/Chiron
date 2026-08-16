'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, PawPrint, Plus, Search } from 'lucide-react';
import type { PatientListItem } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { formatWeight, relativeTime } from '@/lib/format';
import { PATIENT_STATUS, statusFor } from '@/lib/labels';
import { useSession } from '@/lib/session';
import { useSpecies } from '@/lib/catalog';
import { Badge, Card, EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { FilterChips } from '@/components/ui/tabs';
import { PatientFormSheet } from '@/components/patients/patient-form';

function PatientsList() {
  const router = useRouter();
  const params = useSearchParams();
  const { can } = useSession();
  const { data: species = [] } = useSpecies();

  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [speciesId, setSpeciesId] = useState('');
  const [status, setStatus] = useState('active');
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    if (params.get('novo')) {
      setFormOpen(true);
      router.replace('/pacientes');
    }
  }, [params, router]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(timer);
  }, [term]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['patients', { debounced, speciesId, status }],
    queryFn: () =>
      api.get<{ items: PatientListItem[] }>('/patients', {
        q: debounced || undefined,
        speciesId: speciesId || undefined,
        status: status === 'all' ? undefined : status,
        limit: 50,
      }),
  });

  const items = data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Pacientes"
        description="Cadastro clínico dos animais atendidos."
        actions={
          can('patient:create') ? (
            <Button onClick={() => setFormOpen(true)} size="sm">
              <Plus className="h-4 w-4" />
              Novo paciente
            </Button>
          ) : undefined
        }
      />

      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-3)]" />
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Nome, número, microchip"
            className="pl-9"
            inputMode="search"
          />
        </div>
        <Select value={speciesId} onChange={(event) => setSpeciesId(event.target.value)} className="sm:w-52">
          <option value="">Todas as espécies</option>
          {species.map((item) => (
            <option key={item.id} value={item.id}>
              {item.namePt}
            </option>
          ))}
        </Select>
      </div>

      <FilterChips
        className="mb-3"
        value={status}
        onChange={setStatus}
        items={[
          { key: 'active', label: 'Ativos' },
          { key: 'inactive', label: 'Inativos' },
          { key: 'deceased', label: 'Óbito' },
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
            icon={<PawPrint className="h-7 w-7" />}
            title={debounced ? 'Nenhum paciente encontrado' : 'Nenhum paciente cadastrado'}
            description={
              debounced ? 'Ajuste a busca ou os filtros.' : 'Cadastre o primeiro paciente para começar.'
            }
            action={
              can('patient:create') && !debounced ? (
                <Button onClick={() => setFormOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Novo paciente
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {items.map((patient) => {
              const statusInfo = statusFor(PATIENT_STATUS, patient.status);
              return (
                <li key={patient.id}>
                  <Link
                    href={`/pacientes/${patient.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--surface-2)]"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-3)] text-[13px] font-semibold text-[var(--ink-2)]">
                      {patient.name.slice(0, 2).toUpperCase()}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[15px] font-medium text-[var(--ink)]">{patient.name}</span>
                        {patient.alertCount > 0 && (
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[var(--warning)]" aria-label="Tem alertas" />
                        )}
                        {patient.status !== 'active' && (
                          <Badge tone={statusInfo.tone} className="shrink-0">
                            {statusInfo.label}
                          </Badge>
                        )}
                      </span>
                      <span className="block truncate text-[12.5px] text-[var(--ink-3)]">
                        {[patient.speciesName, patient.breedName, patient.ageLabel, formatWeight(patient.currentWeightKg)]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      <span className="block truncate text-[12.5px] text-[var(--ink-3)]">
                        {patient.primaryGuardianName ?? 'Sem tutor vinculado'}
                      </span>
                    </span>

                    <span className="hidden shrink-0 text-right text-[12px] text-[var(--ink-3)] sm:block">
                      {patient.lastEncounterAt ? (
                        <>
                          <span className="block">Último atendimento</span>
                          <span className="block font-medium text-[var(--ink-2)]">
                            {relativeTime(patient.lastEncounterAt)}
                          </span>
                        </>
                      ) : (
                        <span className="block">Sem atendimento</span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <PatientFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={(patient) => router.push(`/pacientes/${patient.id}`)}
      />
    </>
  );
}

export default function PatientsPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={6} />}>
      <PatientsList />
    </Suspense>
  );
}
