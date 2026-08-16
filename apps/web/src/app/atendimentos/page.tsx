"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Clock3, Search, UserRoundPlus } from "lucide-react";
import { AppointmentFlowModal } from "@/components/AppointmentFlowModal";
import { useApp } from "@/context/AppContext";
import { StatusBadge } from "@/components/ui/StatusBadge";

const statusLabel: Record<string, string> = {
  scheduled: "Agendado",
  waiting: "Aguardando",
  in_progress: "Em andamento",
  paused: "Pausado",
  finished: "Finalizado",
  cancelled: "Cancelado",
};

const statusTone: Record<string, "success" | "warning" | "info" | "default"> = {
  scheduled: "default",
  waiting: "warning",
  in_progress: "success",
  paused: "info",
  finished: "success",
  cancelled: "default",
};

export default function AtendimentosPage() {
  const { appointments, patients, veterinarians, startAppointment, addToast } = useApp();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [vetFilter, setVetFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("today");
  const [modalOpen, setModalOpen] = useState(false);

  const appointmentRows = useMemo(
    () =>
      appointments
        .map((appointment) => {
          const patient = patients.find((item) => item.id === appointment.patientId) ?? patients.find((item) => item.name === appointment.patient);
          return {
            ...appointment,
            patientInfo: patient,
          };
        })
        .filter((appointment) => {
          const searchValue = query.trim().toLowerCase();
          const matchesQuery =
            !searchValue ||
            `${appointment.patient} ${appointment.tutor ?? ""} ${appointment.doctor} ${appointment.type}`.toLowerCase().includes(searchValue);

          const matchesStatus = statusFilter === "all" || appointment.status === statusFilter;
          const matchesVeterinarian = vetFilter === "all" || appointment.veterinarianId === vetFilter || appointment.doctor === vetFilter;
          const matchesType = typeFilter === "all" || appointment.type === typeFilter;

          const matchesPeriod =
            periodFilter === "today" ||
            periodFilter === "week" ||
            periodFilter === "month" ||
            periodFilter === "all";

          return matchesQuery && matchesStatus && matchesVeterinarian && matchesType && matchesPeriod;
        }),
    [appointments, patients, query, statusFilter, typeFilter, vetFilter, periodFilter],
  );

  const handleStart = (appointmentId: string) => {
    startAppointment(appointmentId);
    addToast("Atendimento iniciado", "O atendimento foi movido para em andamento.", "success");
  };

  return (
    <div className="mx-auto w-full max-w-[1500px] px-3 py-4 sm:px-4 md:px-6 xl:px-8">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Atendimentos</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Central de atendimentos</h1>
        </div>
        <button type="button" onClick={() => setModalOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0F766E] px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-emerald-900/10 hover:bg-[#115E59]">
          <UserRoundPlus className="h-4 w-4" />
          Novo atendimento
        </button>
      </div>

      <div className="mb-6 rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-1 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <Search className="h-4 w-4 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar paciente, tutor ou atendimento" className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none" />
          </div>

          <div className="flex flex-wrap gap-2">
            <select value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
              <option value="today">Hoje</option>
              <option value="week">7 dias</option>
              <option value="month">30 dias</option>
              <option value="all">Todos</option>
            </select>
            <select value={vetFilter} onChange={(event) => setVetFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
              <option value="all">Todos os veterinários</option>
              {veterinarians.map((vet) => (
                <option key={vet.id} value={vet.id}>{vet.name}</option>
              ))}
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
              <option value="all">Todos os status</option>
              <option value="scheduled">Agendado</option>
              <option value="waiting">Aguardando</option>
              <option value="in_progress">Em andamento</option>
              <option value="paused">Pausado</option>
              <option value="finished">Finalizado</option>
              <option value="cancelled">Cancelado</option>
            </select>
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
              <option value="all">Todos os tipos</option>
              <option value="Consulta">Consulta</option>
              <option value="Retorno">Retorno</option>
              <option value="Vacinação">Vacinação</option>
              <option value="Urgência">Urgência</option>
              <option value="Avaliação">Avaliação</option>
              <option value="Procedimento">Procedimento</option>
              <option value="Exame">Exame</option>
              <option value="Internação">Internação</option>
              <option value="Outro">Outro</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid gap-4">
        {appointmentRows.map((appointment) => (
          <div key={appointment.id} className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                  <Clock3 className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{appointment.time ?? "Horário"}</div>
                  <div className="mt-1 text-2xl font-semibold text-slate-900">{appointment.patient}</div>
                  <div className="mt-1 text-sm text-slate-500">{appointment.patientInfo?.specie ?? "Espécie"} • {appointment.patientInfo?.breed ?? "Raça"}</div>
                  <div className="mt-1 text-sm text-slate-500">Tutor: {appointment.tutor ?? appointment.patientInfo?.owner ?? "Não informado"}</div>
                </div>
              </div>

              <div className="grid gap-2 text-sm text-slate-600 md:grid-cols-2 xl:min-w-[540px]">
                <div className="rounded-2xl bg-slate-50 p-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Tipo</div>
                  <div className="mt-1 font-medium text-slate-800">{appointment.type}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Veterinário</div>
                  <div className="mt-1 font-medium text-slate-800">{appointment.doctor}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Status</div>
                  <div className="mt-2"><StatusBadge label={statusLabel[appointment.status] ?? appointment.status} tone={statusTone[appointment.status] ?? "default"} /></div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Duração</div>
                  <div className="mt-1 font-medium text-slate-800">{appointment.durationMinutes ?? 45} min</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {appointment.status === "scheduled" || appointment.status === "waiting" ? (
                  <button type="button" onClick={() => handleStart(appointment.id)} className="rounded-xl bg-[#0F766E] px-3 py-2 text-sm font-medium text-white">
                    Iniciar
                  </button>
                ) : null}
                {appointment.status === "in_progress" || appointment.status === "paused" ? (
                  <Link href={`/atendimentos/${appointment.id}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
                    Continuar
                  </Link>
                ) : null}
                {appointment.status === "finished" ? (
                  <Link href={`/atendimentos/${appointment.id}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
                    Ver atendimento
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        ))}

        {appointmentRows.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-slate-300 bg-white/70 p-8 text-center text-sm text-slate-500">
            Nenhum atendimento encontrado para os filtros atuais.
          </div>
        ) : null}
      </div>

      <AppointmentFlowModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
