"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";

export default function ProntuariosPage() {
  const { patients, timelines, exams, prescriptions } = useApp();
  const [query, setQuery] = useState("");
  const [speciesFilter, setSpeciesFilter] = useState("Todos");

  const filteredPatients = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return patients.filter((patient) => {
      const matchesQuery =
        normalized.length === 0 ||
        `${patient.name} ${patient.owner} ${patient.specie} ${patient.breed} ${patient.microchip ?? ""} ${patient.internalCode ?? ""}`
          .toLowerCase()
          .includes(normalized);
      const matchesSpecies = speciesFilter === "Todos" || patient.specie === speciesFilter;
      return matchesQuery && matchesSpecies;
    });
  }, [patients, query, speciesFilter]);

  return (
    <div className="mx-auto w-full max-w-[1500px] px-3 py-4 sm:px-4 md:px-6 xl:px-8">
      <div className="mb-5">
        <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Prontuários</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Histórico clínico dos pacientes</h1>
      </div>

      <div className="mb-6 rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <Search className="h-4 w-4 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar paciente, tutor, telefone, microchip ou código interno" className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none" />
          </div>
          <div className="flex flex-wrap gap-2">
            {['Todos', 'Cão', 'Gato', 'Ave', 'Bovino'].map((option) => (
              <button key={option} type="button" onClick={() => setSpeciesFilter(option)} className={`rounded-xl border px-3 py-2 text-sm ${speciesFilter === option ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-700"}`}>
                {option}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {filteredPatients.map((patient) => {
          const patientTimeline = timelines.filter((event) => event.patientId === patient.id);
          const patientExams = exams.filter((exam) => exam.patientId === patient.id);
          const patientPrescriptions = prescriptions.filter((prescription) => prescription.patientId === patient.id);

          return (
            <div key={patient.id} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-2xl font-semibold text-slate-900">{patient.name}</div>
                <div className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-emerald-700">{patient.specie}</div>
              </div>
              <div className="text-sm text-slate-500">{patient.specie} • {patient.breed} • {patient.weight}</div>
              <div className="mt-3 text-sm text-slate-600">Tutor: {patient.owner}</div>

              <div className="mt-5 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Último atendimento</div>
                <div className="mt-2 font-medium text-slate-800">{patientTimeline[0]?.date ?? "Sem registros"}</div>
                <div className="mt-1">{patientTimeline[0]?.doctor ?? "Sem veterinário"}</div>
              </div>

              <div className="mt-4 text-sm text-slate-600">
                Diagnóstico: <span className="font-medium text-slate-900">{patientTimeline[0]?.detail ?? "Sem diagnóstico registrado"}</span>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-500">
                <span>{patientTimeline.length} atendimentos</span>
                <span>{patientExams.length} exames</span>
                <span>{patientPrescriptions.length} receitas</span>
              </div>

              <div className="mt-5">
                <Link href={`/pacientes/${patient.id}/prontuario`} className="inline-flex rounded-xl bg-[#0F766E] px-3 py-2 text-sm font-medium text-white">Abrir prontuário</Link>
              </div>
            </div>
          );
        })}
      </div>

      {filteredPatients.length === 0 ? (
        <div className="mt-6 rounded-[28px] border border-dashed border-slate-300 bg-white/60 p-8 text-center text-sm text-slate-500">
          Nenhum prontuário encontrado para os filtros atuais.
        </div>
      ) : null}
    </div>
  );
}
