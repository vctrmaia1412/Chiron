"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Activity, ArrowRight, CalendarClock, Clock3, FileText, Stethoscope, Syringe, UserRoundPlus } from "lucide-react";
import { AppointmentFlowModal } from "@/components/AppointmentFlowModal";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useApp } from "@/context/AppContext";

const statusLabels: Record<string, string> = {
  scheduled: "Agendado",
  waiting: "Aguardando",
  in_progress: "Em atendimento",
  paused: "Pausado",
  finished: "Finalizado",
  cancelled: "Cancelado",
};

const statusTones: Record<string, "success" | "warning" | "info" | "default"> = {
  scheduled: "default",
  waiting: "warning",
  in_progress: "success",
  paused: "info",
  finished: "success",
  cancelled: "default",
};

export default function Home() {
  const { appointments, patients, exams, vaccines, notifications } = useApp();
  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false);

  const todayIso = "2026-08-13";
  const todayLabel = "Hoje";

  const todayAppointments = useMemo(
    () =>
      appointments
        .filter((appointment) => appointment.date === todayIso)
        .sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99")),
    [appointments, todayIso],
  );

  const metrics = useMemo(
    () => [
      {
        label: "Consultas hoje",
        value: String(todayAppointments.length),
        href: "/atendimentos?status=all",
        tone: "emerald" as const,
      },
      {
        label: "Em atendimento",
        value: String(todayAppointments.filter((appointment) => appointment.status === "in_progress").length),
        href: "/atendimentos?status=in_progress",
        tone: "blue" as const,
      },
      {
        label: "Aguardando atendimento",
        value: String(todayAppointments.filter((appointment) => appointment.status === "waiting").length),
        href: "/atendimentos?status=waiting",
        tone: "amber" as const,
      },
      {
        label: "Exames pendentes",
        value: String(exams.filter((exam) => !["Resultado disponível", "Revisado"].includes(exam.status)).length),
        href: "/exame?status=pending",
        tone: "slate" as const,
      },
    ],
    [exams, todayAppointments],
  );

  const upcomingAppointments = useMemo(
    () =>
      todayAppointments
        .filter((appointment) => !["finished", "cancelled"].includes(appointment.status))
        .slice(0, 4),
    [todayAppointments],
  );

  const clinicalAlerts = useMemo(() => {
    const alerts = [] as Array<{ id: string; label: string; detail: string; tone: "warning" | "info" | "success"; }>; 

    const pendingReturns = appointments.filter((appointment) => appointment.type === "Retorno" && !["finished", "cancelled"].includes(appointment.status));
    if (pendingReturns.length > 0) {
      alerts.push({
        id: "returns",
        label: `${pendingReturns.length} retorno${pendingReturns.length > 1 ? "s" : ""} pendente${pendingReturns.length > 1 ? "s" : ""}`,
        detail: "Acompanhamento clínico em aberto.",
        tone: "warning",
      });
    }

    const pendingExams = exams.filter((exam) => !["Resultado disponível", "Revisado"].includes(exam.status));
    if (pendingExams.length > 0) {
      alerts.push({
        id: "exams",
        label: `${pendingExams.length} exame${pendingExams.length > 1 ? "s" : ""} aguardando resultado`,
        detail: "Laboratório com análise pendente.",
        tone: "info",
      });
    }

    const dueVaccines = vaccines.filter((vaccine) => {
      if (!vaccine.nextDose) return false;
      const [day, month, year] = vaccine.nextDose.split("/").map(Number);
      const next = new Date(Date.UTC(year, month - 1, day));
      const anchoredNow = new Date(Date.UTC(2026, 7, 13));
      const windowEnd = new Date(Date.UTC(2026, 7, 42));
      return !Number.isNaN(next.getTime()) && next.getTime() >= anchoredNow.getTime() && next.getTime() <= windowEnd.getTime();
    });
    if (dueVaccines.length > 0) {
      alerts.push({
        id: "vaccines",
        label: `${dueVaccines.length} vacina${dueVaccines.length > 1 ? "s" : ""} próxima${dueVaccines.length > 1 ? "s" : ""} do vencimento`,
        detail: "Revisão vacinal recomendada.",
        tone: "warning",
      });
    }

    const unreadNotifications = notifications.filter((notification) => !notification.read);
    if (unreadNotifications.length > 0) {
      alerts.push({
        id: "notifications",
        label: `${unreadNotifications.length} alerta${unreadNotifications.length > 1 ? "s" : ""} pendente${unreadNotifications.length > 1 ? "s" : ""}`,
        detail: "Comunicações operacionais recentes.",
        tone: "success",
      });
    }

    return alerts.slice(0, 4);
  }, [appointments, exams, notifications, vaccines]);

  const recentPatients = useMemo(() => {
    return [...patients]
      .map((patient) => {
        const lastAppointment = appointments
          .filter((appointment) => appointment.patientId === patient.id)
          .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || (b.time ?? "99:99").localeCompare(a.time ?? "99:99"))[0];

        return {
          patient,
          lastAppointment,
        };
      })
      .sort((a, b) => {
        const aDate = a.lastAppointment?.date ?? "";
        const bDate = b.lastAppointment?.date ?? "";
        return bDate.localeCompare(aDate) || (b.lastAppointment?.time ?? "99:99").localeCompare(a.lastAppointment?.time ?? "99:99");
      })
      .slice(0, 3);
  }, [appointments, patients]);

  const quickActions = [
    { label: "Novo atendimento", icon: UserRoundPlus, href: null },
    { label: "Novo paciente", icon: Activity, href: "/pacientes" },
    { label: "Agendar consulta", icon: CalendarClock, href: "/agenda" },
    { label: "Nova receita", icon: FileText, href: "/prontuarios" },
    { label: "Solicitar exame", icon: Stethoscope, href: "/exame" },
    { label: "Novo documento", icon: Syringe, href: "/prontuarios" },
  ];

  return (
    <div className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-4 md:px-6 xl:px-8">
      <header className="mb-4 flex flex-col gap-2 sm:mb-5 sm:gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400 sm:text-[11px]">Dashboard</div>
          <h1 className="mt-2 text-[1.7rem] font-semibold tracking-tight text-slate-900 sm:text-3xl md:text-4xl">Boas-vindas, Dra. Amanda.</h1>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 sm:text-sm">
          <CalendarClock className="h-3.5 w-3.5 text-emerald-700" />
          {todayLabel}
        </div>
      </header>

      <section className="grid grid-cols-2 gap-2.5 md:gap-3 xl:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} value={metric.value} label={metric.label} tone={metric.tone} href={metric.href} />
        ))}
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="rounded-[24px] border border-slate-200 bg-white p-3 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900 sm:text-xl">Próximos atendimentos</h2>
            <Link href="/agenda" className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 sm:text-sm">
              Ver agenda <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="space-y-2 sm:space-y-3">
            {upcomingAppointments.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                Nenhum atendimento pendente para este dia.
              </div>
            ) : (
              upcomingAppointments.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-2.5 sm:p-3">
                  <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[10px] font-semibold text-slate-700 ring-1 ring-slate-200 sm:h-11 sm:w-11 sm:text-sm">
                      {item.time ?? "--:--"}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900 sm:text-base">{item.patient}</div>
                      <div className="truncate text-[11px] text-slate-500 sm:text-sm">{item.type} • {item.doctor}</div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge label={statusLabels[item.status] ?? item.status} tone={statusTones[item.status] ?? "default"} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-white p-3 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900 sm:text-xl">Atenção clínica</h2>
            <StatusBadge label="Hoje" tone="info" />
          </div>

          <div className="space-y-2 sm:space-y-3">
            {clinicalAlerts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                Nenhuma situação clínica pendente.
              </div>
            ) : (
              clinicalAlerts.map((alert) => (
                <div key={alert.id} className="flex items-start gap-3 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
                  <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${alert.tone === "warning" ? "bg-amber-500" : alert.tone === "info" ? "bg-sky-500" : "bg-emerald-500"}`} />
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900">{alert.label}</div>
                    <div className="mt-1 text-xs text-slate-500">{alert.detail}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[24px] border border-slate-200 bg-white p-3 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900 sm:text-xl">Pacientes recentes</h2>
            <Link href="/pacientes" className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 sm:text-sm">
              Ver todos <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="space-y-2 sm:space-y-3">
            {recentPatients.map(({ patient, lastAppointment }) => (
              <Link key={patient.id} href={`/pacientes/${patient.id}`} className="block rounded-2xl border border-slate-200 bg-slate-50 p-3 transition-colors hover:border-emerald-200 hover:bg-emerald-50/30">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900 sm:text-base">{patient.name}</div>
                    <div className="mt-1 text-[11px] text-slate-500 sm:text-xs">{patient.specie} • {patient.breed}</div>
                  </div>
                  <div className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-slate-500 ring-1 ring-slate-200">{patient.specie}</div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-slate-600 sm:text-sm">
                  <span className="truncate">Tutor: {patient.owner}</span>
                  <span className="text-right text-slate-500">{lastAppointment ? `${lastAppointment.type} • ${lastAppointment.date}` : "Sem registro"}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-white p-3 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900 sm:text-xl">Ações rápidas</h2>
            <StatusBadge label="Workflow" tone="success" />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-2">
            {quickActions.map(({ label, icon: Icon, href }) => (
              href ? (
                <Link key={label} href={href} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2.5 text-left text-[11px] font-medium text-slate-700 transition-colors hover:border-emerald-200 hover:bg-emerald-50/30 sm:text-sm">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-emerald-700 ring-1 ring-slate-200">
                    <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </span>
                  {label}
                </Link>
              ) : (
                <button key={label} type="button" onClick={() => setAppointmentModalOpen(true)} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2.5 text-left text-[11px] font-medium text-slate-700 transition-colors hover:border-emerald-200 hover:bg-emerald-50/30 sm:text-sm">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-emerald-700 ring-1 ring-slate-200">
                    <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </span>
                  {label}
                </button>
              )
            ))}
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-[24px] border border-slate-200 bg-slate-950 p-3 text-slate-50 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-[9px] uppercase tracking-[0.2em] text-slate-400 sm:text-[10px]">Fluxo clínico</div>
            <h2 className="mt-2 text-base font-semibold text-white sm:text-xl">Atendimento guiado</h2>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-white/5 px-2.5 py-1 text-[9px] text-slate-300 sm:text-xs">
            <Clock3 className="h-3 w-3" />
            09:00 - 10:00
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            "Paciente",
            "Anamnese",
            "Exame físico",
            "Sinais vitais",
            "Avaliação",
            "Diagnóstico",
            "Conduta",
            "Prescrição",
          ].map((step, index) => (
            <div key={step} className="rounded-2xl border border-slate-700 bg-slate-900/80 p-2.5 text-[11px] text-slate-200 sm:p-3 sm:text-sm">
              <div className="mb-2 text-[9px] uppercase tracking-[0.2em] text-slate-500 sm:text-[10px]">Etapa {index + 1}</div>
              {step}
            </div>
          ))}
        </div>
      </section>

      <AppointmentFlowModal open={appointmentModalOpen} onClose={() => setAppointmentModalOpen(false)} />
    </div>
  );
}
