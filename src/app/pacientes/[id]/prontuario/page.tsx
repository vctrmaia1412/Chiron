"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useApp } from "@/context/AppContext";

const tabs = ["Resumo", "Linha do tempo", "Atendimentos", "Diagnósticos", "Exames", "Receitas", "Vacinas", "Documentos", "Internações"] as const;

export default function PatientMedicalRecordPage() {
  const params = useParams<{ id: string }>();
  const { patients, timelines, appointments, exams, prescriptions, vaccines, documents, clinicalRecords } = useApp();
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("Resumo");

  const patient = useMemo(() => patients.find((item) => item.id === params.id), [params.id, patients]);
  const patientTimeline = useMemo(() => timelines.filter((event) => event.patientId === patient?.id), [patient?.id, timelines]);
  const patientAppointments = useMemo(() => appointments.filter((appointment) => appointment.patientId === patient?.id), [appointments, patient?.id]);
  const patientExams = useMemo(() => exams.filter((exam) => exam.patientId === patient?.id), [exams, patient?.id]);
  const patientPrescriptions = useMemo(() => prescriptions.filter((prescription) => prescription.patientId === patient?.id), [patient?.id, prescriptions]);
  const patientVaccines = useMemo(() => vaccines.filter((vaccine) => vaccine.patientId === patient?.id), [patient?.id, vaccines]);
  const patientDocuments = useMemo(() => documents.filter((document) => document.patientId === patient?.id), [documents, patient?.id]);
  const patientRecord = useMemo(() => clinicalRecords.find((record) => record.patientId === patient?.id), [clinicalRecords, patient?.id]);

  if (!patient) {
    return (
      <div className="mx-auto max-w-[640px] px-4 py-10">
        <div className="rounded-[28px] border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="text-xl font-semibold text-slate-900">Paciente não encontrado</div>
          <Link href="/prontuarios" className="mt-4 inline-flex rounded-xl bg-[#0F766E] px-4 py-2 text-sm font-medium text-white">Voltar para prontuários</Link>
        </div>
      </div>
    );
  }

  const renderTab = () => {
    if (activeTab === "Resumo") {
      return (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Queixa principal</div>
            <div className="mt-2 text-sm text-slate-700">{patientRecord?.chiefComplaint ?? "Aguardando registro"}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Diagnóstico</div>
            <div className="mt-2 text-sm text-slate-700">{patientRecord?.diagnosis ?? "Aguardando diagnóstico"}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Anamnese</div>
            <div className="mt-2 text-sm text-slate-700">{patientRecord?.anamnesis ?? "Aguardando anamnese"}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Sinais vitais</div>
            <div className="mt-2 text-sm text-slate-700">{patientRecord?.vitalSigns ?? "Aguardando sinais vitais"}</div>
          </div>
        </div>
      );
    }

    if (activeTab === "Linha do tempo") {
      return (
        <div className="space-y-4">
          {patientTimeline.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">Nenhum evento na linha do tempo.</div> : patientTimeline.map((event) => (
            <div key={event.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">{event.title}</div>
                <div className="rounded-full bg-white px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-500">{event.tag}</div>
              </div>
              <div className="mt-2 text-sm text-slate-500">{event.date} · {event.doctor}</div>
              <div className="mt-2 text-sm text-slate-700">{event.detail}</div>
            </div>
          ))}
        </div>
      );
    }

    if (activeTab === "Atendimentos") {
      return (
        <div className="space-y-3">
          {patientAppointments.map((appointment) => (
            <div key={appointment.id} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <div>
                <div className="font-medium text-slate-900">{appointment.type}</div>
                <div className="mt-1 text-slate-500">{appointment.date} • {appointment.time}</div>
              </div>
              <div className="rounded-full bg-white px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-500">{appointment.status}</div>
            </div>
          ))}
        </div>
      );
    }

    if (activeTab === "Exames") {
      return (
        <div className="space-y-3">
          {patientExams.map((exam) => (
            <div key={exam.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <div className="flex items-center justify-between">
                <div className="font-medium text-slate-900">{exam.name}</div>
                <div className="rounded-full bg-white px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-500">{exam.status}</div>
              </div>
              <div className="mt-2 text-slate-500">{exam.lab} · {exam.priority}</div>
            </div>
          ))}
        </div>
      );
    }

    if (activeTab === "Receitas") {
      return (
        <div className="space-y-3">
          {patientPrescriptions.map((prescription) => (
            <div key={prescription.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <div className="font-medium text-slate-900">{prescription.date}</div>
              <div className="mt-2">{prescription.items.map((item) => item.name).join(", ")}</div>
            </div>
          ))}
        </div>
      );
    }

    if (activeTab === "Vacinas") {
      return (
        <div className="space-y-3">
          {patientVaccines.map((vaccine) => (
            <div key={vaccine.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <div className="font-medium text-slate-900">{vaccine.name}</div>
              <div className="mt-2 text-slate-500">{vaccine.date} · {vaccine.doctor}</div>
            </div>
          ))}
        </div>
      );
    }

    if (activeTab === "Documentos") {
      return (
        <div className="space-y-3">
          {patientDocuments.map((document) => (
            <div key={document.id} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <div>
                <div className="font-medium text-slate-900">{document.name}</div>
                <div className="text-slate-500">{document.type}</div>
              </div>
              <div className="text-slate-500">{document.size}</div>
            </div>
          ))}
        </div>
      );
    }

    return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Nenhuma informação disponível para este módulo.</div>;
  };

  return (
    <div className="mx-auto w-full max-w-[1500px] px-3 py-4 sm:px-4 md:px-6 xl:px-8">
      <div className="mb-5 flex items-center justify-between gap-3">
        <Link href="/prontuarios" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600">
          <ArrowLeft className="h-4 w-4" />
          Voltar para prontuários
        </Link>
        <Link href={`/atendimentos`} className="rounded-xl bg-[#0F766E] px-3 py-2 text-sm font-medium text-white">Abrir atendimento</Link>
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Prontuário</div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">{patient.name}</div>
            <div className="mt-1 text-sm text-slate-500">{patient.specie} • {patient.breed} • {patient.weight} • {patient.sex}</div>
          </div>
          <div className="rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-600">Tutor: {patient.owner}</div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
          {tabs.map((tab) => (
            <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`rounded-xl px-3 py-2 text-sm ${activeTab === tab ? "bg-[#E6F4F2] text-[#0F766E]" : "bg-slate-50 text-slate-600"}`}>
              {tab}
            </button>
          ))}
        </div>

        <div className="mt-5">{renderTab()}</div>
      </div>
    </div>
  );
}
