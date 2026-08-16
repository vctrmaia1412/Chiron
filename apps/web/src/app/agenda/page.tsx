"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarDays, Clock3, Plus, Video } from "lucide-react";
import { AppointmentFlowModal } from "@/components/AppointmentFlowModal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useApp } from "@/context/AppContext";

export default function AgendaPage() {
  const { appointments, patients } = useApp();
  const [modalOpen, setModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"day" | "week" | "month">("day");
  const [selectedDate, setSelectedDate] = useState<string>("2026-08-13");

  const schedule = useMemo(() => {
    return appointments
      .filter((item) => statusFilter === "all" || item.status === statusFilter)
      .map((item) => {
        const patient = patients.find((entry) => entry.id === item.patientId) ?? null;
        return {
          ...item,
          patientInfo: patient,
        };
      })
      .sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99"));
  }, [appointments, patients, statusFilter]);

  const distinctDates = useMemo(
    () => Array.from(new Set(appointments.map((item) => item.date))).sort(),
    [appointments],
  );

  const effectiveSelectedDate = distinctDates.includes(selectedDate) ? selectedDate : distinctDates[0] ?? "2026-08-13";

  const dateCounts = useMemo(
    () =>
      appointments.reduce<Record<string, number>>((accumulator, item) => {
        accumulator[item.date] = (accumulator[item.date] ?? 0) + 1;
        return accumulator;
      }, {}),
    [appointments],
  );

  const selectedDaySchedule = useMemo(
    () => schedule.filter((item) => item.date === effectiveSelectedDate),
    [effectiveSelectedDate, schedule],
  );

  const selectedDateObject = useMemo(() => {
    const parsed = new Date(`${selectedDate}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }, [selectedDate]);

  const weekDates = useMemo(() => {
    const start = new Date(selectedDateObject);
    const dayIndex = start.getDay();
    const mondayOffset = dayIndex === 0 ? -6 : 1 - dayIndex;
    start.setDate(start.getDate() + mondayOffset);

    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date.toISOString().slice(0, 10);
    });
  }, [selectedDateObject]);

  const formatDateLabel = (value: string) => {
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long" }).format(parsed);
  };

  const monthDate = new Date(`${effectiveSelectedDate}T00:00:00`);
  const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(monthDate);
  const firstDayOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const leadingDays = firstDayOfMonth.getDay();

  const calendarDays: Array<string | null> = Array.from({ length: leadingDays + daysInMonth }, (_, index) => {
    if (index < leadingDays) {
      return null;
    }

    const dayNumber = index - leadingDays + 1;
    return `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
  });

  return (
    <div className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-4 md:px-6 xl:px-8">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Agenda</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Agenda clínica</h1>
        </div>
        <button type="button" onClick={() => setModalOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-[#0F766E] px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-emerald-900/10 hover:bg-[#115E59]">
          <Plus className="h-4 w-4" />
          Novo agendamento
        </button>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {['all', 'scheduled', 'waiting', 'in_progress', 'paused', 'finished'].map((option) => (
          <button key={option} type="button" onClick={() => setStatusFilter(option)} className={`rounded-xl border px-3 py-2 text-sm ${statusFilter === option ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600"}`}>
            {option === 'all' ? 'Todos' : option === 'scheduled' ? 'Agendado' : option === 'waiting' ? 'Aguardando' : option === 'in_progress' ? 'Em andamento' : option === 'paused' ? 'Pausado' : 'Finalizado'}
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <aside className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)] sm:p-5">
          <div className="flex items-center justify-between">
            <div className="text-xl font-semibold capitalize text-slate-900">{monthLabel}</div>
            <button type="button" onClick={() => setSelectedDate(effectiveSelectedDate)} className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-600">Hoje</button>
          </div>

          <div className="mt-5 grid grid-cols-7 gap-2 text-center text-xs font-medium text-slate-500">
            {[
              { short: "Dom", key: "dom" },
              { short: "Seg", key: "seg" },
              { short: "Ter", key: "ter" },
              { short: "Qua", key: "qua" },
              { short: "Qui", key: "qui" },
              { short: "Sex", key: "sex" },
              { short: "Sáb", key: "sab" },
            ].map((day) => (
              <div key={day.key} className="py-2">{day.short}</div>
            ))}
            {calendarDays.map((dateValue, index) => {
              if (!dateValue) {
                return <div key={`empty-${index}`} className="h-10 rounded-xl border border-transparent" />;
              }

              const active = effectiveSelectedDate === dateValue;
              const count = dateCounts[dateValue] ?? 0;

              return (
                <button
                  key={dateValue}
                  type="button"
                  onClick={() => {
                    setSelectedDate(dateValue);
                    setViewMode("day");
                  }}
                  className={`relative flex h-10 items-center justify-center rounded-xl border text-xs ${active ? "border-[#0F766E] bg-[#0F766E] text-white" : "border-slate-200 bg-slate-50 text-slate-700"}`}
                >
                  {new Date(`${dateValue}T00:00:00`).getDate()}
                  {count > 0 ? <span className={`absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] ${active ? "bg-white text-[#0F766E]" : "bg-emerald-100 text-emerald-700"}`}>{count}</span> : null}
                </button>
              );
            })}
          </div>
        </aside>

        <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)] sm:p-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <CalendarDays className="h-5 w-5 text-emerald-700" />
              {viewMode === "week"
                ? `${formatDateLabel(weekDates[0])} - ${formatDateLabel(weekDates[weekDates.length - 1])}`
                : formatDateLabel(effectiveSelectedDate)}
            </div>
            <div className="flex gap-2">
              {(["day", "week", "month"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  className={`rounded-xl border px-3 py-2 text-sm ${viewMode === mode ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}
                >
                  {mode === "day" ? "Dia" : mode === "week" ? "Semana" : "Mês"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {viewMode === "week" ? (
              weekDates.map((dateValue) => {
                const dateItems = schedule.filter((item) => item.date === dateValue);

                return (
                  <div key={dateValue} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDate(dateValue);
                        setViewMode("day");
                      }}
                      className="mb-3 flex w-full items-center justify-between text-left"
                    >
                      <span className="text-sm font-semibold text-slate-800">{formatDateLabel(dateValue)}</span>
                      <span className="text-[11px] text-slate-500">{dateItems.length} item{dateItems.length === 1 ? "" : "ns"}</span>
                    </button>

                    <div className="space-y-2">
                      {dateItems.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-2 text-xs text-slate-500">Sem atendimentos</div>
                      ) : (
                        dateItems.map((item) => (
                          <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-2.5 text-sm text-slate-700">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-slate-900">{item.patient}</span>
                              <StatusBadge
                                label={item.status === "scheduled" ? "Agendado" : item.status === "waiting" ? "Aguardando" : item.status === "in_progress" ? "Em andamento" : item.status === "paused" ? "Pausado" : item.status === "finished" ? "Finalizado" : "Cancelado"}
                                tone={item.status === "scheduled" ? "default" : item.status === "waiting" ? "warning" : item.status === "in_progress" ? "success" : item.status === "paused" ? "info" : "success"}
                              />
                            </div>
                            <div className="mt-1 text-xs text-slate-500">{item.time} • {item.type}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })
            ) : viewMode === "month" ? (
              calendarDays.filter((dateValue): dateValue is string => Boolean(dateValue)).map((dateValue) => {
                const dateItems = schedule.filter((item) => item.date === dateValue);

                return (
                  <div key={dateValue} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDate(dateValue);
                        setViewMode("day");
                      }}
                      className="mb-2 flex w-full items-center justify-between text-left"
                    >
                      <span className="text-sm font-semibold text-slate-800">{formatDateLabel(dateValue)}</span>
                      <span className="text-[11px] text-slate-500">{dateItems.length} agend{dateItems.length === 1 ? "a" : "as"}</span>
                    </button>

                    <div className="space-y-2">
                      {dateItems.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-2 text-xs text-slate-500">Sem agendamentos</div>
                      ) : (
                        dateItems.slice(0, 2).map((item) => (
                          <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-700">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-slate-900">{item.patient}</span>
                              <span className="text-[10px] text-slate-500">{item.time}</span>
                            </div>
                            <div className="mt-1 text-[10px] text-slate-500">{item.type}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })
            ) : selectedDaySchedule.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                Nenhum agendamento para este dia com o filtro atual.
              </div>
            ) : (
              selectedDaySchedule.map((item) => (
                <div key={item.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white ring-1 ring-slate-200">
                      <Clock3 className="h-4 w-4 text-slate-500" />
                    </div>
                    <div>
                      <div className="text-sm text-slate-500">{item.time}</div>
                      <div className="text-lg font-semibold text-slate-900">{item.patient}</div>
                    </div>
                  </div>

                  <div className="flex flex-1 items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-slate-700">{item.type}</div>
                      <div className="text-sm text-slate-500">{item.doctor}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge
                        label={item.status === "scheduled" ? "Agendado" : item.status === "waiting" ? "Aguardando" : item.status === "in_progress" ? "Em andamento" : item.status === "paused" ? "Pausado" : item.status === "finished" ? "Finalizado" : "Cancelado"}
                        tone={item.status === "scheduled" ? "default" : item.status === "waiting" ? "warning" : item.status === "in_progress" ? "success" : item.status === "paused" ? "info" : "success"}
                      />
                      {item.type === "Retorno" ? <Video className="h-4 w-4 text-slate-400" /> : null}
                      {item.patientInfo ? (
                        <Link href={`/pacientes/${item.patientInfo.id}`} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600">Paciente</Link>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <AppointmentFlowModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
