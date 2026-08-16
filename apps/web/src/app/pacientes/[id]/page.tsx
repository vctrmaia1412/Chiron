"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CalendarRange, FileText, HeartPulse, MoreHorizontal, Plus, Stethoscope, Syringe, Upload, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";
import { Timeline } from "@/components/Timeline";
import { PatientForm } from "@/components/PatientForms";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useApp } from "@/context/AppContext";

export default function PatientDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { patients, tutors, timelines, prescriptions, exams, documents, addToast, deletePatient } = useApp();
  const [activeTab, setActiveTab] = useState("Linha do tempo");
  const [formOpen, setFormOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const patient = useMemo(() => patients.find((item) => item.id === params.id), [params.id, patients]);

  const tutor = patient?.tutorId ? tutors.find((item) => item.id === patient.tutorId) : undefined;
  const patientTimeline = useMemo(() => timelines.filter((item) => item.patientId === patient?.id), [patient?.id, timelines]);
  const patientPrescriptions = useMemo(() => prescriptions.filter((item) => item.patientId === patient?.id), [patient?.id, prescriptions]);
  const patientExams = useMemo(() => exams.filter((item) => item.patientId === patient?.id), [patient?.id, exams]);
  const patientDocuments = useMemo(() => documents.filter((item) => item.patientId === patient?.id), [patient?.id, documents]);

  if (!patient) {
    return (
      <div className="mx-auto max-w-[800px] px-4 py-10">
        <div className="rounded-[28px] border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="text-lg font-semibold text-slate-900">Paciente não encontrado</div>
          <Link href="/pacientes" className="mt-4 inline-flex rounded-xl bg-[#0F766E] px-4 py-2 text-sm text-white">
            Voltar para pacientes
          </Link>
        </div>
      </div>
    );
  }

  const handleDelete = () => {
    deletePatient(patient.id);
    addToast("Paciente removido", `${patient.name} foi removido do cadastro.`, "success");
    router.push("/pacientes");
  };

  const renderTabContent = () => {
    if (activeTab === "Resumo") {
      return (
        <div className="grid gap-3">
          {[
            { label: "Última consulta", value: "12/08/2026" },
            { label: "Próximo retorno", value: "19/08/2026" },
            { label: "Vacinas", value: "V10 em dia" },
            { label: "Observações", value: patient.notes?.join(" • ") ?? "Sem observações" },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">{item.label}</div>
              <div className="mt-2 font-medium text-slate-800">{item.value}</div>
            </div>
          ))}
        </div>
      );
    }

    if (activeTab === "Histórico") {
      return (
        <div className="space-y-3">
          {patientTimeline.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">Nenhum evento registrado.</div> : patientTimeline.map((event) => (
            <div key={event.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-slate-900">{event.title}</div>
                <span className="rounded-full bg-white px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-500">{event.tag}</span>
              </div>
              <div className="mt-2 text-slate-500">{event.date} · {event.doctor}</div>
              <div className="mt-1">{event.detail}</div>
            </div>
          ))}
        </div>
      );
    }

    if (activeTab === "Exames") {
      return (
        <div className="space-y-3">
          {patientExams.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">Nenhum exame solicitado.</div> : patientExams.map((exam) => (
            <div key={exam.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-slate-900">{exam.name}</div>
                <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700">{exam.status}</span>
              </div>
              <div className="mt-2 text-sm text-slate-600">{exam.lab} · {exam.priority}</div>
            </div>
          ))}
        </div>
      );
    }

    if (activeTab === "Prescrições") {
      return (
        <div className="space-y-3">
          {patientPrescriptions.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">Nenhuma receita registrada.</div> : patientPrescriptions.map((prescription) => (
            <div key={prescription.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="font-semibold text-slate-900">{prescription.date}</div>
              <div className="mt-2 text-sm text-slate-700">{prescription.items.map((item) => item.name).join(", ")}</div>
            </div>
          ))}
        </div>
      );
    }

    if (activeTab === "Documentos") {
      return (
        <div className="space-y-3">
          {patientDocuments.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">Nenhum documento anexado.</div> : patientDocuments.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <div>
                <div className="font-medium text-slate-900">{doc.name}</div>
                <div className="text-slate-500">{doc.type}</div>
              </div>
              <div className="text-slate-500">{doc.size}</div>
            </div>
          ))}
        </div>
      );
    }

    return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Selecione uma aba para visualizar o conteúdo.</div>;
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-4 md:px-6 xl:px-8">
      <div className="mb-5 flex items-center justify-between gap-3">
        <Link href="/pacientes" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600">
          <ArrowLeft className="h-4 w-4" />
          Voltar para pacientes
        </Link>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setFormOpen(true)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">Editar</button>
          <button type="button" onClick={() => setConfirmDelete(true)} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">Excluir</button>
          <Link href="/atendimentos" className="inline-flex items-center gap-2 rounded-xl bg-[#0F766E] px-4 py-2 text-sm font-medium text-white hover:bg-[#115E59]">
            <Plus className="h-4 w-4" />
            Novo atendimento
          </Link>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className={`flex h-20 w-20 items-center justify-center rounded-[26px] text-2xl font-bold text-white ${patient.avatarColor}`}>{patient.name.slice(0, 2).toUpperCase()}</div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Paciente</div>
                <h1 className="mt-1 text-3xl font-semibold text-slate-900">{patient.name}</h1>
                <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                  <span>{patient.breed}</span>
                  <span>•</span>
                  <span>{patient.sex}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <StatusBadge label={patient.status} tone={patient.status === "Retorno" ? "warning" : patient.status === "Atenção" ? "info" : "success"} />
              {patient.notes?.slice(0, 2).map((note) => <StatusBadge key={note} label={note} tone="success" />)}
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl bg-slate-50 p-4"><div className="text-xs uppercase tracking-[0.2em] text-slate-400">Idade</div><div className="mt-2 text-lg font-semibold text-slate-900">{patient.age}</div></div>
            <div className="rounded-2xl bg-slate-50 p-4"><div className="text-xs uppercase tracking-[0.2em] text-slate-400">Peso</div><div className="mt-2 text-lg font-semibold text-slate-900">{patient.weight}</div></div>
            <div className="rounded-2xl bg-slate-50 p-4"><div className="text-xs uppercase tracking-[0.2em] text-slate-400">Espécie</div><div className="mt-2 text-lg font-semibold text-slate-900">{patient.specie}</div></div>
            <div className="rounded-2xl bg-slate-50 p-4"><div className="text-xs uppercase tracking-[0.2em] text-slate-400">Status</div><div className="mt-2 text-lg font-semibold text-emerald-700">{patient.status}</div></div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {[{ text: "Nova receita", icon: FileText }, { text: "Novo exame", icon: Stethoscope }, { text: "Nova vacina", icon: Syringe }, { text: "Mais ações", icon: MoreHorizontal }].map(({ text, icon: Icon }) => (
              <button key={text} type="button" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
                <Icon className="h-4 w-4" />
                {text}
              </button>
            ))}
          </div>

          <div className="mt-8 border-b border-slate-200 pb-3">
            <nav className="flex flex-wrap gap-2 text-sm font-medium text-slate-500">
              {['Resumo', 'Histórico', 'Linha do tempo', 'Exames', 'Prescrições', 'Documentos'].map((tab) => (
                <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`rounded-xl px-3 py-2 ${activeTab === tab ? "bg-[#E6F4F2] text-[#0F766E]" : "bg-transparent"}`}>
                  {tab}
                </button>
              ))}
            </nav>
            <div className="mt-5">{renderTabContent()}</div>
          </div>
        </section>

        <aside className="space-y-6">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Tutor</div>
            <h2 className="mt-2 text-xl font-semibold text-slate-900">{tutor?.name ?? patient.owner}</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="flex justify-between gap-3 rounded-xl bg-slate-50 p-3"><span>Telefone</span><span className="font-medium text-slate-800">{tutor?.phone ?? patient.ownerPhone}</span></div>
              <div className="flex justify-between gap-3 rounded-xl bg-slate-50 p-3"><span>Email</span><span className="font-medium text-slate-800">{tutor?.email ?? patient.ownerEmail}</span></div>
              <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">{tutor?.address ?? "Endereço em atualização"}</div>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Documentos</h3>
              <button type="button" className="rounded-xl bg-slate-100 p-2 text-slate-600"><Upload className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              {patientDocuments.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 p-3 text-sm text-slate-500">Nenhum documento.</div> : patientDocuments.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm"><div><div className="font-medium text-slate-800">{doc.name}</div><div className="mt-1 text-slate-500">{doc.type}</div></div><span className="text-slate-500">{doc.size}</span></div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <section className="mt-8 grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Linha do tempo clínica</h2>
            <button type="button" className="text-sm font-medium text-emerald-700">Exportar</button>
          </div>
          <Timeline patientId={patient.id} />
        </div>

        <div className="space-y-6">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
            <h3 className="text-lg font-semibold text-slate-900">Resumo clínico</h3>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="flex items-center justify-between"><span>Última consulta</span><span className="font-medium text-slate-800">12/08/2026</span></div>
              <div className="flex items-center justify-between"><span>Próximo retorno</span><span className="font-medium text-slate-800">19/08/2026</span></div>
              <div className="flex items-center justify-between"><span>Vacinas</span><span className="font-medium text-slate-800">V10 em dia</span></div>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
            <h3 className="text-lg font-semibold text-slate-900">Ações clínicas</h3>
            <div className="mt-4 grid gap-3">
              {[
                { label: "Atendimento", icon: CalendarRange },
                { label: "Receita", icon: FileText },
                { label: "Exame", icon: HeartPulse },
                { label: "Pagamento", icon: WalletCards },
              ].map(({ label, icon: Icon }) => (
                <button key={label} type="button" className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left text-sm font-medium text-slate-700">
                  <span className="flex items-center gap-2"><Icon className="h-4 w-4 text-emerald-700" />{label}</span><span className="text-slate-400">→</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <PatientForm open={formOpen} onClose={() => setFormOpen(false)} initialData={{ id: patient.id, name: patient.name, specie: patient.specie, breed: patient.breed, sex: patient.sex, age: patient.age, weight: patient.weight, owner: patient.owner, ownerPhone: patient.ownerPhone, ownerEmail: patient.ownerEmail, notes: patient.notes ?? [] }} />
      <ConfirmDialog open={confirmDelete} title="Excluir paciente" description={`Tem certeza que deseja excluir ${patient.name}?`} onCancel={() => setConfirmDelete(false)} onConfirm={() => { handleDelete(); setConfirmDelete(false); }} />
    </div>
  );
}
