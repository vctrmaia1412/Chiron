'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Phone, Syringe } from 'lucide-react';
import type { DueItem, Immunization, PreventiveTreatment } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { addDays, formatDate, formatDateTime, formatPhone, toIsoDate, whatsappLink } from '@/lib/format';
import { Badge, Card, CardHeader, EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';

function ImmunizationsView() {
  const params = useSearchParams();
  const [tab, setTab] = useState<'pendentes' | 'aplicadas'>(params.get('pendentes') ? 'pendentes' : 'pendentes');
  const [horizon, setHorizon] = useState(30);

  const due = useQuery({
    queryKey: ['immunizations', 'due', horizon],
    queryFn: () =>
      api.get<{ items: DueItem[] }>('/immunizations/due', {
        until: toIsoDate(addDays(new Date(), horizon)),
        limit: 100,
      }),
    enabled: tab === 'pendentes',
  });

  const applied = useQuery({
    queryKey: ['immunizations', 'applied'],
    queryFn: () =>
      api.get<{ immunizations: Immunization[]; preventives: PreventiveTreatment[] }>('/immunizations', { limit: 60 }),
    enabled: tab === 'aplicadas',
  });

  return (
    <>
      <PageHeader
        title="Vacinas e preventivos"
        description="Pendências de próxima dose e histórico de aplicações."
      />

      <Tabs
        className="mb-4"
        value={tab}
        onChange={(key) => setTab(key as typeof tab)}
        items={[
          { key: 'pendentes', label: 'Pendentes', count: due.data?.items.length },
          { key: 'aplicadas', label: 'Aplicadas' },
        ]}
      />

      {tab === 'pendentes' ? (
        <Card>
          <CardHeader
            title="Doses a vencer"
            action={
              <div className="flex gap-1">
                {[15, 30, 60].map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setHorizon(days)}
                    className={`rounded-full px-2.5 py-1 text-[12.5px] font-medium ${
                      horizon === days
                        ? 'bg-[var(--brand-soft)] text-[var(--brand-ink)]'
                        : 'text-[var(--ink-3)] hover:bg-[var(--surface-2)]'
                    }`}
                  >
                    {days} dias
                  </button>
                ))}
              </div>
            }
          />
          {due.error ? (
            <ErrorState message={errorMessage(due.error)} onRetry={() => void due.refetch()} />
          ) : due.isLoading ? (
            <ListSkeleton rows={5} />
          ) : (due.data?.items ?? []).length === 0 ? (
            <EmptyState
              icon={<Syringe className="h-7 w-7" />}
              title="Nenhuma dose pendente"
              description={`Nada vencendo nos próximos ${horizon} dias.`}
            />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {(due.data?.items ?? []).map((item) => {
                const overdue = new Date(`${item.dueAt}T12:00:00`) < new Date();
                const wa = whatsappLink(
                  item.guardianPhone,
                  `Olá! Aqui é da clínica. A ${item.productName} do ${item.patientName} está prevista para ${formatDate(item.dueAt)}. Podemos agendar?`,
                );
                return (
                  <li key={`${item.kind}-${item.id}`} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/pacientes/${item.patientId}`}
                            className="truncate text-[14.5px] font-medium text-[var(--ink)] hover:text-[var(--brand)]"
                          >
                            {item.patientName}
                          </Link>
                          <Badge tone={overdue ? 'danger' : 'warning'}>
                            {overdue ? 'Vencida' : 'A vencer'} {formatDate(item.dueAt)}
                          </Badge>
                        </div>
                        <p className="truncate text-[13px] text-[var(--ink-2)]">{item.productName}</p>
                        {item.guardianName && (
                          <p className="truncate text-[12.5px] text-[var(--ink-3)]">
                            {item.guardianName}
                            {item.guardianPhone ? ` · ${formatPhone(item.guardianPhone)}` : ''}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        {item.guardianPhone && (
                          <a
                            href={`tel:${item.guardianPhone.replace(/\D/g, '')}`}
                            aria-label="Ligar"
                            className="flex h-9 w-9 items-center justify-center rounded-[var(--radius)] border border-[var(--border-strong)] text-[var(--ink-2)]"
                          >
                            <Phone className="h-4 w-4" />
                          </a>
                        )}
                        {wa && (
                          <a
                            href={wa}
                            target="_blank"
                            rel="noreferrer"
                            className="flex h-9 items-center rounded-[var(--radius)] border border-[var(--border-strong)] px-2.5 text-[12.5px] font-medium text-[var(--ink-2)]"
                          >
                            Avisar
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="mt-2">
                      <Button asChild size="sm" variant="secondary">
                        <Link href={`/agenda?novo=1&pacienteId=${item.patientId}`}>Agendar aplicação</Link>
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      ) : (
        <Card>
          <CardHeader title="Aplicações registradas" />
          {applied.isLoading ? (
            <ListSkeleton rows={5} />
          ) : (applied.data?.immunizations ?? []).length === 0 &&
            (applied.data?.preventives ?? []).length === 0 ? (
            <EmptyState icon={<Syringe className="h-7 w-7" />} title="Nenhuma aplicação registrada" />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {(applied.data?.immunizations ?? []).map((item) => (
                <li key={item.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/pacientes/${item.patientId}`}
                      className="text-[14.5px] font-medium text-[var(--ink)] hover:text-[var(--brand)]"
                    >
                      {item.patientName ?? 'Paciente'}
                    </Link>
                    <span className="text-[13px] text-[var(--ink-2)]">{item.vaccineName}</span>
                    {item.status !== 'completed' && <Badge tone="muted">Cancelada</Badge>}
                  </div>
                  <p className="text-[12.5px] text-[var(--ink-3)]">
                    {[formatDateTime(item.administeredAt), item.lotNumber ? `lote ${item.lotNumber}` : null, item.professionalName]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </li>
              ))}
              {(applied.data?.preventives ?? []).map((item) => (
                <li key={item.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/pacientes/${item.patientId}`}
                      className="text-[14.5px] font-medium text-[var(--ink)] hover:text-[var(--brand)]"
                    >
                      {item.patientName ?? 'Paciente'}
                    </Link>
                    <span className="text-[13px] text-[var(--ink-2)]">{item.productName}</span>
                    <Badge tone="neutral">Preventivo</Badge>
                  </div>
                  <p className="text-[12.5px] text-[var(--ink-3)]">
                    {[formatDateTime(item.administeredAt), item.doseText, item.professionalName]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}

export default function ImmunizationsPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={5} />}>
      <ImmunizationsView />
    </Suspense>
  );
}
