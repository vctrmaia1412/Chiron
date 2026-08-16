'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, ClipboardList, Clock, Plus, Users } from 'lucide-react';
import type { Dashboard } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { formatTime, formatWeekday, relativeTime } from '@/lib/format';
import { APPOINTMENT_STATUS, ENCOUNTER_STATUS, statusFor } from '@/lib/labels';
import { useSession } from '@/lib/session';
import { Badge, Card, CardHeader, EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';

export default function DashboardPage() {
  const { context, can } = useSession();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<Dashboard>('/dashboard'),
    refetchInterval: 60_000,
  });

  const firstName = context?.user.name.split(' ')[0] ?? '';

  return (
    <>
      <PageHeader
        title={`Bom dia, ${firstName}`}
        description={data ? capitalize(formatWeekday(`${data.date}T12:00:00`)) : undefined}
        actions={
          <>
            {can('appointment:create') && (
              <Button asChild variant="secondary" size="sm">
                <Link href="/agenda?novo=1">
                  <CalendarDays className="h-4 w-4" />
                  Agendar
                </Link>
              </Button>
            )}
            {can('patient:create') && (
              <Button asChild size="sm">
                <Link href="/pacientes?novo=1">
                  <Plus className="h-4 w-4" />
                  Novo paciente
                </Link>
              </Button>
            )}
          </>
        }
      />

      {error ? (
        <Card>
          <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
        </Card>
      ) : isLoading || !data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-20 animate-soft-pulse rounded-[var(--radius-lg)] bg-[var(--surface-3)]" />
            ))}
          </div>
          <Card>
            <ListSkeleton />
          </Card>
        </div>
      ) : (
        <div className="space-y-4 md:space-y-5">
          <MetricsRow metrics={data.metrics} />

          {data.alerts.length > 0 && <AlertsRow alerts={data.alerts} />}

          <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr] md:gap-5">
            <TodayAgenda agenda={data.agenda} />
            <div className="space-y-4 md:space-y-5">
              <OpenEncounters encounters={data.openEncounters} />
              <RecentPatients patients={data.recentPatients} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Quatro números, cada um com uma pergunta operacional por trás e um destino
 * clicável. Sem cartão decorativo e sem repetir o mesmo dado em dois lugares.
 */
function MetricsRow({ metrics }: { metrics: Dashboard['metrics'] }) {
  const cards = [
    { label: 'Na recepção', value: metrics.waiting, href: '/atendimentos?filtro=aguardando', tone: 'warning' as const },
    { label: 'Em atendimento', value: metrics.inProgress, href: '/atendimentos?filtro=andamento', tone: 'brand' as const },
    { label: 'Agendados hoje', value: metrics.appointmentsToday, href: '/agenda', tone: 'neutral' as const },
    { label: 'Finalizados hoje', value: metrics.finishedToday, href: '/atendimentos?filtro=finalizados', tone: 'success' as const },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => (
        <Link
          key={card.label}
          href={card.href}
          className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 shadow-[var(--shadow-sm)] transition-colors hover:border-[var(--brand)]"
        >
          <p className="text-[12.5px] text-[var(--ink-3)]">{card.label}</p>
          <p className="mt-1 text-[26px] font-semibold leading-none tabular text-[var(--ink)]">{card.value}</p>
        </Link>
      ))}
    </div>
  );
}

function AlertsRow({ alerts }: { alerts: Dashboard['alerts'] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {alerts.map((alert) => (
        <Link
          key={alert.kind}
          href={alert.href}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--warning)]/25 bg-[var(--warning-soft)] px-3 py-1.5 text-[13px] font-medium text-[var(--warning)] transition-opacity hover:opacity-85"
        >
          {alert.label}
          <span className="tabular rounded-full bg-white/70 px-1.5 text-[12px]">{alert.count}</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ))}
    </div>
  );
}

function TodayAgenda({ agenda }: { agenda: Dashboard['agenda'] }) {
  return (
    <Card>
      <CardHeader
        title="Agenda de hoje"
        action={
          <Link href="/agenda" className="text-[13px] font-medium text-[var(--brand)]">
            Ver agenda
          </Link>
        }
      />
      {agenda.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-7 w-7" />}
          title="Nenhum agendamento para hoje"
          description="Os horários marcados aparecem aqui em ordem cronológica."
        />
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {agenda.map((item) => {
            const status = statusFor(APPOINTMENT_STATUS, item.status);
            const href = item.encounterId
              ? `/atendimentos/${item.encounterId}`
              : item.patientId
                ? `/pacientes/${item.patientId}`
                : '/agenda';
            return (
              <li key={item.id}>
                <Link href={href} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-2)]">
                  <span className="w-12 shrink-0 text-[13px] font-semibold tabular text-[var(--ink-2)]">
                    {formatTime(item.startAt)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-medium text-[var(--ink)]">
                      {item.patientName ?? item.guardianName ?? 'Sem paciente'}
                    </span>
                    <span className="block truncate text-[12.5px] text-[var(--ink-3)]">
                      {item.serviceName}
                      {item.professionalName ? ` · ${item.professionalName}` : ''}
                    </span>
                  </span>
                  <Badge tone={status.tone} className="shrink-0">
                    {status.label}
                  </Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function OpenEncounters({ encounters }: { encounters: Dashboard['openEncounters'] }) {
  return (
    <Card>
      <CardHeader
        title="Fila de atendimento"
        action={
          <Link href="/atendimentos" className="text-[13px] font-medium text-[var(--brand)]">
            Ver fila
          </Link>
        }
      />
      {encounters.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-7 w-7" />}
          title="Ninguém aguardando"
          description="Pacientes com check-in aparecem aqui."
        />
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {encounters.map((encounter) => {
            const status = statusFor(ENCOUNTER_STATUS, encounter.status);
            return (
              <li key={encounter.id}>
                <Link
                  href={`/atendimentos/${encounter.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-2)]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-medium text-[var(--ink)]">
                      {encounter.patientName}
                    </span>
                    <span className="flex items-center gap-1 text-[12.5px] text-[var(--ink-3)]">
                      <Clock className="h-3 w-3" />
                      {relativeTime(encounter.startedAt ?? encounter.arrivedAt)}
                      {encounter.professionalName ? ` · ${encounter.professionalName}` : ''}
                    </span>
                  </span>
                  <Badge tone={status.tone} dot className="shrink-0">
                    {status.label}
                  </Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function RecentPatients({ patients }: { patients: Dashboard['recentPatients'] }) {
  if (patients.length === 0) return null;
  return (
    <Card>
      <CardHeader title="Atendidos recentemente" />
      <ul className="divide-y divide-[var(--border)]">
        {patients.map((patient) => (
          <li key={patient.id}>
            <Link
              href={`/pacientes/${patient.id}`}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--surface-2)]"
            >
              <Users className="h-4 w-4 shrink-0 text-[var(--ink-3)]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-[var(--ink)]">{patient.name}</span>
                <span className="block truncate text-[12.5px] text-[var(--ink-3)]">
                  {patient.speciesName}
                  {patient.guardianName ? ` · ${patient.guardianName}` : ''}
                </span>
              </span>
              <span className="shrink-0 text-[12px] text-[var(--ink-3)]">{relativeTime(patient.lastEncounterAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
