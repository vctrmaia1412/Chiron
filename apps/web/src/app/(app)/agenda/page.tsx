'use client';

import { Suspense, useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  LogIn,
  Plus,
  Search,
  XCircle,
} from 'lucide-react';
import type { Appointment, FollowUp } from '@chiron/contracts';

/** O que já vem preenchido no novo agendamento (retorno, ficha do paciente). */
type NewAppointmentPreset = { patientId?: string; originEncounterId?: string; reason?: string; date?: Date };
import { api, errorMessage } from '@/lib/api';
import { addDays, endOfDay, formatDate, formatTime, formatWeekday, isToday, startOfDay, toIsoDate } from '@/lib/format';
import { APPOINTMENT_STATUS, statusFor } from '@/lib/labels';
import { useProfessionals } from '@/lib/catalog';
import { useSession } from '@/lib/session';
import { useDebounced } from '@/lib/use-debounced';
import { Badge, Card, CardHeader, EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
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

  // A URL é a fonte do estado inicial: o inicializador lê o parâmetro uma vez,
  // sem efeito copiando valor e disparando renderização em cascata.
  const focusId = params.get('agendamento');
  const [today] = useState(() => new Date());
  const [chosenDay, setChosenDay] = useState<Date | null>(() => parseIsoDate(params.get('data')));
  const [professionalId, setProfessionalId] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  // Semana: a recepção enxerga os buracos e os dias cheios antes de marcar.
  const [view, setView] = useState<'dia' | 'semana'>(() => (params.get('visao') === 'semana' ? 'semana' : 'dia'));
  const [newForm, setNewForm] = useState<NewAppointmentPreset | null>(() =>
    params.get('novo')
      ? {
          patientId: params.get('pacienteId') ?? undefined,
          originEncounterId: params.get('retornoDe') ?? undefined,
          reason: params.get('motivo') ?? undefined,
          date: parseIsoDate(params.get('data')) ?? undefined,
        }
      : null,
  );
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
  const [checkInTarget, setCheckInTarget] = useState<Appointment | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);
  const [showFollowUps, setShowFollowUps] = useState(() => Boolean(params.get('retornos')));

  // Link da busca aponta um agendamento: a agenda abre no dia dele.
  const { data: focused } = useQuery({
    queryKey: ['appointment', focusId],
    queryFn: () => api.get<Appointment>(`/appointments/${focusId}`),
    enabled: Boolean(focusId) && !chosenDay,
  });
  const focusedStart = focused?.startAt;
  const day = useMemo(
    () => chosenDay ?? (focusedStart ? new Date(focusedStart) : today),
    [chosenDay, focusedStart, today],
  );
  const setDay = (next: Date) => setChosenDay(next);
  const scrollToFocused = useCallback((node: HTMLLIElement | null) => {
    node?.scrollIntoView({ block: 'center' });
  }, []);

  const weekStart = useMemo(() => addDays(startOfDay(day), -((day.getDay() + 6) % 7)), [day]);
  const range = useMemo(
    () =>
      view === 'semana'
        ? { from: weekStart.toISOString(), to: endOfDay(addDays(weekStart, 6)).toISOString() }
        : { from: startOfDay(day).toISOString(), to: endOfDay(day).toISOString() },
    [view, day, weekStart],
  );
  const step = view === 'semana' ? 7 : 1;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['appointments', range.from, range.to, professionalId],
    queryFn: () =>
      api.get<{ items: Appointment[] }>('/appointments', {
        from: range.from,
        to: range.to,
        professionalId: professionalId || undefined,
        limit: 500,
      }),
    // Recepção e consultório mexem na mesma agenda: atualiza sozinha.
    refetchInterval: 30_000,
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
        description={
          view === 'semana'
            ? `Semana de ${formatDate(weekStart)} a ${formatDate(addDays(weekStart, 6))}`
            : capitalize(formatWeekday(day))
        }
        actions={
          can('appointment:create') ? (
            <Button size="sm" onClick={() => setNewForm({})}>
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
            aria-label={view === 'semana' ? 'Semana anterior' : 'Dia anterior'}
            onClick={() => setDay(addDays(day, -step))}
            className="flex h-10 w-10 items-center justify-center text-[var(--ink-2)] hover:bg-[var(--surface-2)]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input
            type="date"
            value={toIsoDate(day)}
            onChange={(event) => {
              const next = parseIsoDate(event.target.value);
              if (next) setDay(next);
            }}
            className="h-10 border-x border-[var(--border-strong)] bg-transparent px-2 text-[13.5px] text-[var(--ink)] focus:outline-none"
          />
          <button
            type="button"
            aria-label={view === 'semana' ? 'Próxima semana' : 'Próximo dia'}
            onClick={() => setDay(addDays(day, step))}
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

        <div
          role="group"
          aria-label="Visão da agenda"
          className="flex rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] p-0.5"
        >
          {(['dia', 'semana'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={view === option}
              onClick={() => setView(option)}
              className={`h-9 rounded-[calc(var(--radius)-2px)] px-3 text-[13px] font-medium ${
                view === option ? 'bg-[var(--brand)] text-white' : 'text-[var(--ink-2)]'
              }`}
            >
              {option === 'dia' ? 'Dia' : 'Semana'}
            </button>
          ))}
        </div>

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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card>
          {error ? (
            <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
          ) : isLoading ? (
            <ListSkeleton rows={5} />
          ) : view === 'semana' ? (
            <WeekList
              weekStart={weekStart}
              items={items}
              onOpenDay={(date) => {
                setDay(date);
                setView('dia');
              }}
            />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="h-7 w-7" />}
              title="Nenhum agendamento neste dia"
              description={`Nada marcado para ${formatDate(day)}.`}
              action={
                can('appointment:create') ? (
                  <Button onClick={() => setNewForm({})}>
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
                const canReschedule =
                  can('appointment:update') && ['scheduled', 'confirmed'].includes(appointment.status);
                const isFocused = appointment.id === focusId;

                return (
                  <li
                    key={appointment.id}
                    ref={isFocused ? scrollToFocused : undefined}
                    className={`px-4 py-3 ${isFocused ? 'bg-[var(--brand-soft)]' : ''}`}
                  >
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

                    {(canCheckIn || canConfirm || canCancel || canReschedule || appointment.encounterId) && (
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
                        {canReschedule && (
                          <Button size="sm" variant="ghost" onClick={() => setRescheduleTarget(appointment)}>
                            <CalendarClock className="h-3.5 w-3.5" />
                            Remarcar
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

        <FollowUpsCard
          open={showFollowUps}
          onOpen={() => setShowFollowUps(true)}
          onSchedule={(followUp) =>
            setNewForm({
              patientId: followUp.patientId,
              originEncounterId: followUp.encounterId,
              reason: followUp.reason ?? 'Retorno',
              date: parseIsoDate(followUp.dueAt) ?? undefined,
            })
          }
        />
      </div>

      <AppointmentFormSheet
        open={newForm !== null}
        onOpenChange={(next) => {
          if (next) return;
          setNewForm(null);
          if (params.get('novo') || params.get('pacienteId')) router.replace('/agenda');
        }}
        defaultDate={newForm?.date ?? day}
        defaultPatientId={newForm?.patientId}
        defaultReason={newForm?.reason}
        originEncounterId={newForm?.originEncounterId}
        onSaved={(saved) => setDay(new Date(saved.startAt))}
      />

      <AppointmentFormSheet
        key={rescheduleTarget?.id ?? 'remarcar'}
        open={Boolean(rescheduleTarget)}
        onOpenChange={(next) => {
          if (!next) setRescheduleTarget(null);
        }}
        appointment={rescheduleTarget}
        onSaved={(saved) => setDay(new Date(saved.startAt))}
      />

      <CheckInSheet
        appointment={checkInTarget}
        onClose={() => setCheckInTarget(null)}
        // Recepção faz o check-in e continua na agenda; quem atende vai direto.
        onCheckedIn={(encounterId) => {
          if (can('encounter:update')) router.push(`/atendimentos/${encounterId}`);
        }}
      />

      <CancelAppointmentSheet appointment={cancelTarget} onClose={() => setCancelTarget(null)} />
    </>
  );
}

/**
 * Semana em lista por dia: cabe no celular sem grade espremida. Tocar no dia
 * (ou num horário) abre a visão do dia, onde ficam check-in e remarcar.
 */
function WeekList({
  weekStart,
  items,
  onOpenDay,
}: {
  weekStart: Date;
  items: Appointment[];
  onOpenDay: (date: Date) => void;
}) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  return (
    <ul className="divide-y divide-[var(--border)]">
      {days.map((date) => {
        const key = toIsoDate(date);
        const dayItems = items.filter((appointment) => toIsoDate(new Date(appointment.startAt)) === key);
        const active = dayItems.filter((appointment) => !['cancelled', 'no_show'].includes(appointment.status));
        return (
          <li key={key}>
            <button
              type="button"
              onClick={() => onOpenDay(date)}
              className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-[var(--surface-2)] ${
                isToday(date) ? 'bg-[var(--brand-soft)]' : 'bg-[var(--surface-2)]/60'
              }`}
            >
              <span className="text-[13.5px] font-semibold text-[var(--ink)]">
                {capitalize(formatWeekday(date))}
              </span>
              <span className="text-[12.5px] text-[var(--ink-3)]">
                {active.length === 0 ? 'livre' : `${active.length} ${active.length === 1 ? 'horário' : 'horários'}`}
              </span>
            </button>
            {dayItems.length > 0 && (
              <ul>
                {dayItems.map((appointment) => {
                  const status = statusFor(APPOINTMENT_STATUS, appointment.status);
                  return (
                    <li key={appointment.id}>
                      <button
                        type="button"
                        onClick={() => onOpenDay(date)}
                        className="flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left hover:bg-[var(--surface-2)]"
                      >
                        <span className="w-12 shrink-0 text-[13.5px] font-semibold tabular text-[var(--ink)]">
                          {formatTime(appointment.startAt)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] text-[var(--ink)]">
                            {appointment.patient?.name ?? appointment.guardian?.name ?? 'Sem paciente'}
                          </span>
                          <span className="block truncate text-[12px] text-[var(--ink-3)]">
                            {[appointment.service.name, appointment.professional?.name].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** "2026-10-15" vira a data local (sem fuso deslocando o dia). */
function parseIsoDate(value: string | null): Date | null {
  const [year, month, date] = (value ?? '').split('-').map(Number);
  return year && month && date ? new Date(year, month - 1, date) : null;
}

const FOLLOW_UP_PAGE = 20;

function FollowUpsCard({
  open,
  onOpen,
  onSchedule,
}: {
  open: boolean;
  onOpen: () => void;
  onSchedule: (followUp: FollowUp) => void;
}) {
  const { can } = useSession();
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(FOLLOW_UP_PAGE);
  const q = useDebounced(search.trim(), 300);
  const { data, isLoading } = useQuery({
    queryKey: ['follow-ups', q, limit],
    queryFn: () => api.get<{ items: FollowUp[] }>('/follow-ups', { limit, q: q || undefined }),
    enabled: can('appointment:read'),
    placeholderData: (previous) => previous,
  });

  const items = data?.items ?? [];
  const mayHaveMore = items.length >= limit && limit < 100;

  // No celular o cartão aparece quando há retorno pendente, abaixo da agenda.
  return (
    <Card className={open || items.length > 0 || q ? '' : 'hidden lg:block'}>
      <CardHeader
        title="Retornos a agendar"
        description="Atendimentos que pediram reavaliação e ainda não têm horário marcado. Os mais atrasados primeiro."
      />
      <div className="relative border-b border-[var(--border)] px-4 py-2.5">
        <Search className="pointer-events-none absolute left-7 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-3)]" />
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setLimit(FOLLOW_UP_PAGE);
          }}
          placeholder="Buscar paciente ou tutor"
          aria-label="Buscar retorno por paciente ou tutor"
          className="pl-9"
        />
      </div>
      {isLoading ? (
        <ListSkeleton rows={3} />
      ) : items.length === 0 ? (
        <EmptyState
          title={q ? `Nenhum retorno para "${q}"` : 'Nenhum retorno pendente'}
          description={q ? undefined : 'Todos os retornos indicados já foram agendados.'}
        />
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
                <Button size="sm" variant="secondary" onClick={() => onSchedule(followUp)}>
                  Agendar retorno
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {mayHaveMore && (
        <div className="border-t border-[var(--border)] p-3">
          <Button variant="secondary" block onClick={() => setLimit((current) => Math.min(100, current + FOLLOW_UP_PAGE))}>
            Mostrar mais
          </Button>
        </div>
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
