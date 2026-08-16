'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, LogIn, Plus, XCircle } from 'lucide-react';
import type { Appointment, FollowUp } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { addDays, endOfDay, formatDate, formatTime, formatWeekday, isToday, startOfDay, toIsoDate } from '@/lib/format';
import { APPOINTMENT_STATUS, statusFor } from '@/lib/labels';
import { useProfessionals } from '@/lib/catalog';
import { useSession } from '@/lib/session';
import { Badge, Card, CardHeader, EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { FilterChips } from '@/components/ui/tabs';
import { AppointmentFormSheet } from '@/components/scheduling/appointment-form';
import { CheckInSheet } from '@/components/scheduling/check-in-sheet';
import { CancelAppointmentSheet } from '@/components/scheduling/cancel-sheet';

function AgendaView() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const { can } = useSession();
  const { data: professionals = [] } = useProfessionals();

  const [day, setDay] = useState(() => new Date());
  const [professionalId, setProfessionalId] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  // A URL é a fonte do estado inicial: o inicializador lê o parâmetro uma vez,
  // sem efeito copiando valor e disparando renderização em cascata.
  const [formOpen, setFormOpen] = useState(() => Boolean(params.get('novo')));
  const [checkInTarget, setCheckInTarget] = useState<Appointment | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);
  const [showFollowUps, setShowFollowUps] = useState(() => Boolean(params.get('retornos')));
  const presetPatientId = params.get('pacienteId') ?? undefined;

  const range = useMemo(() => ({ from: startOfDay(day).toISOString(), to: endOfDay(day).toISOString() }), [day]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['appointments', range.from, professionalId],
    queryFn: () =>
      api.get<{ items: Appointment[] }>('/appointments', {
        from: range.from,
        to: range.to,
        professionalId: professionalId || undefined,
        limit: 200,
      }),
  });

  const confirmMutation = useMutation({
    mutationFn: (id: string) => api.post(`/appointments/${id}/confirm`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
      toast.success('Agendamento confirmado.');
    },
    onError: (caught) => toast.error(errorMessage(caught)),
  });

  const items = (data?.items ?? []).filter((appointment) => {
    if (statusFilter === 'all') return appointment.status !== 'rescheduled';
    if (statusFilter === 'open') {
      return ['scheduled', 'confirmed', 'checked_in', 'in_service'].includes(appointment.status);
    }
    return appointment.status === statusFilter;
  });

  return (
    <>
      <PageHeader
        title="Agenda"
        description={capitalize(formatWeekday(day))}
        actions={
          can('appointment:create') ? (
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" />
              Agendar
            </Button>
          ) : undefined
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)]">
          <button
            type="button"
            aria-label="Dia anterior"
            onClick={() => setDay((current) => addDays(current, -1))}
            className="flex h-10 w-10 items-center justify-center text-[var(--ink-2)] hover:bg-[var(--surface-2)]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input
            type="date"
            value={toIsoDate(day)}
            onChange={(event) => {
              const [year, month, date] = event.target.value.split('-').map(Number);
              if (year && month && date) setDay(new Date(year, month - 1, date));
            }}
            className="h-10 border-x border-[var(--border-strong)] bg-transparent px-2 text-[13.5px] text-[var(--ink)] focus:outline-none"
          />
          <button
            type="button"
            aria-label="Próximo dia"
            onClick={() => setDay((current) => addDays(current, 1))}
            className="flex h-10 w-10 items-center justify-center text-[var(--ink-2)] hover:bg-[var(--surface-2)]"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {!isToday(day) && (
          <Button variant="ghost" size="sm" onClick={() => setDay(new Date())}>
            Hoje
          </Button>
        )}

        <Select
          value={professionalId}
          onChange={(event) => setProfessionalId(event.target.value)}
          className="w-full sm:w-56"
        >
          <option value="">Todos os profissionais</option>
          {professionals.map((professional) => (
            <option key={professional.id} value={professional.id}>
              {professional.name}
            </option>
          ))}
        </Select>
      </div>

      <FilterChips
        className="mb-3"
        value={statusFilter}
        onChange={setStatusFilter}
        items={[
          { key: 'all', label: 'Todos' },
          { key: 'open', label: 'Em aberto' },
          { key: 'checked_in', label: 'Na recepção' },
          { key: 'completed', label: 'Concluídos' },
          { key: 'cancelled', label: 'Cancelados' },
          { key: 'no_show', label: 'Faltas' },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          {error ? (
            <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
          ) : isLoading ? (
            <ListSkeleton rows={5} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="h-7 w-7" />}
              title="Nenhum agendamento neste dia"
              description={`Nada marcado para ${formatDate(day)}.`}
              action={
                can('appointment:create') ? (
                  <Button onClick={() => setFormOpen(true)}>
                    <Plus className="h-4 w-4" />
                    Agendar
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {items.map((appointment) => {
                const status = statusFor(APPOINTMENT_STATUS, appointment.status);
                const canCheckIn =
                  can('appointment:checkin') && ['scheduled', 'confirmed'].includes(appointment.status);
                const canConfirm = can('appointment:update') && appointment.status === 'scheduled';
                const canCancel =
                  can('appointment:cancel') &&
                  ['scheduled', 'confirmed', 'checked_in'].includes(appointment.status);

                return (
                  <li key={appointment.id} className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <div className="w-14 shrink-0">
                        <p className="text-[14px] font-semibold tabular text-[var(--ink)]">
                          {formatTime(appointment.startAt)}
                        </p>
                        <p className="text-[11.5px] tabular text-[var(--ink-3)]">{formatTime(appointment.endAt)}</p>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {appointment.patient ? (
                            <Link
                              href={`/pacientes/${appointment.patient.id}`}
                              className="truncate text-[15px] font-medium text-[var(--ink)] hover:text-[var(--brand)]"
                            >
                              {appointment.patient.name}
                            </Link>
                          ) : (
                            <span className="text-[15px] font-medium text-[var(--ink)]">
                              {appointment.guardian?.name ?? 'Sem paciente'}
                            </span>
                          )}
                          <Badge tone={status.tone}>{status.label}</Badge>
                        </div>

                        <p className="truncate text-[12.5px] text-[var(--ink-3)]">
                          {[
                            appointment.service.name,
                            appointment.patient?.speciesName,
                            appointment.professional?.name,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        {appointment.reason && (
                          <p className="mt-0.5 truncate text-[13px] text-[var(--ink-2)]">{appointment.reason}</p>
                        )}
                        {appointment.cancelReason && (
                          <p className="mt-0.5 text-[12.5px] text-[var(--ink-3)]">
                            Motivo: {appointment.cancelReason}
                          </p>
                        )}
                      </div>
                    </div>

                    {(canCheckIn || canConfirm || canCancel || appointment.encounterId) && (
                      <div className="mt-2 flex flex-wrap gap-2 pl-[68px]">
                        {appointment.encounterId && (
                          <Button asChild size="sm" variant="subtle">
                            <Link href={`/atendimentos/${appointment.encounterId}`}>Abrir atendimento</Link>
                          </Button>
                        )}
                        {canCheckIn && (
                          <Button size="sm" onClick={() => setCheckInTarget(appointment)}>
                            <LogIn className="h-3.5 w-3.5" />
                            Check-in
                          </Button>
                        )}
                        {canConfirm && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => confirmMutation.mutate(appointment.id)}
                            loading={confirmMutation.isPending && confirmMutation.variables === appointment.id}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Confirmar
                          </Button>
                        )}
                        {canCancel && (
                          <Button size="sm" variant="ghost" onClick={() => setCancelTarget(appointment)}>
                            <XCircle className="h-3.5 w-3.5" />
                            Cancelar
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <FollowUpsCard open={showFollowUps} onOpen={() => setShowFollowUps(true)} />
      </div>

      <AppointmentFormSheet
        open={formOpen}
        onOpenChange={(next) => {
          setFormOpen(next);
          if (!next && (params.get('novo') || params.get('pacienteId'))) router.replace('/agenda');
        }}
        defaultDate={day}
        defaultPatientId={presetPatientId}
      />

      <CheckInSheet
        appointment={checkInTarget}
        onClose={() => setCheckInTarget(null)}
        onCheckedIn={(encounterId) => router.push(`/atendimentos/${encounterId}`)}
      />

      <CancelAppointmentSheet appointment={cancelTarget} onClose={() => setCancelTarget(null)} />
    </>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function FollowUpsCard({ open, onOpen }: { open: boolean; onOpen: () => void }) {
  const { can } = useSession();
  const { data, isLoading } = useQuery({
    queryKey: ['follow-ups'],
    queryFn: () => api.get<{ items: FollowUp[] }>('/follow-ups', { limit: 20 }),
    enabled: can('appointment:read'),
  });

  const items = data?.items ?? [];

  return (
    <Card className={open ? '' : 'hidden lg:block'}>
      <CardHeader
        title="Retornos a agendar"
        description="Atendimentos que pediram reavaliação e ainda não têm horário marcado."
      />
      {isLoading ? (
        <ListSkeleton rows={3} />
      ) : items.length === 0 ? (
        <EmptyState title="Nenhum retorno pendente" description="Todos os retornos indicados já foram agendados." />
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {items.map((followUp) => (
            <li key={followUp.encounterId} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/pacientes/${followUp.patientId}`}
                    className="block truncate text-[14.5px] font-medium text-[var(--ink)] hover:text-[var(--brand)]"
                  >
                    {followUp.patientName}
                  </Link>
                  <p className="truncate text-[12.5px] text-[var(--ink-3)]">
                    {followUp.reason ?? 'Reavaliação clínica'}
                  </p>
                  {followUp.guardianName && (
                    <p className="truncate text-[12.5px] text-[var(--ink-3)]">{followUp.guardianName}</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[12px] text-[var(--ink-3)]">previsto</p>
                  <p className="text-[13px] font-medium text-[var(--ink-2)]">{formatDate(followUp.dueAt)}</p>
                </div>
              </div>
              <div className="mt-2">
                <Button asChild size="sm" variant="secondary">
                  <Link href={`/agenda?novo=1&pacienteId=${followUp.patientId}`}>Agendar retorno</Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={onOpen} className="sr-only">
        Mostrar retornos
      </button>
    </Card>
  );
}

export default function AgendaPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={6} />}>
      <AgendaView />
    </Suspense>
  );
}
