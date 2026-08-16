"use client";

import { Search, ArrowRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { useApp } from "@/context/AppContext";

export function SearchCommand() {
  const { searchOpen, setSearchOpen, patients, tutors, appointments, exams } = useApp();
  const router = useRouter();
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const patientResults = patients
      .filter((patient) => `${patient.name} ${patient.owner} ${patient.specie} ${patient.breed}`.toLowerCase().includes(q))
      .slice(0, 6)
      .map((patient) => ({
        id: patient.id,
        label: patient.name,
        subtitle: `${patient.breed} · ${patient.owner}`,
        href: `/pacientes/${patient.id}`,
        type: "Paciente",
      }));

    const tutorResults = tutors
      .filter((tutor) => `${tutor.name} ${tutor.email}`.toLowerCase().includes(q))
      .slice(0, 4)
      .map((tutor) => ({
        id: tutor.id,
        label: tutor.name,
        subtitle: "Tutor responsável",
        href: `/pacientes`,
        type: "Tutor",
      }));

    const appointmentResults = appointments
      .filter((appointment) => `${appointment.patient} ${appointment.doctor} ${appointment.type}`.toLowerCase().includes(q))
      .slice(0, 4)
      .map((appointment) => ({
        id: appointment.id,
        label: appointment.patient,
        subtitle: `${appointment.type} · ${appointment.time}`,
        href: "/agenda",
        type: "Consulta",
      }));

    const examResults = exams
      .filter((exam) => `${exam.name} ${exam.lab}`.toLowerCase().includes(q))
      .slice(0, 4)
      .map((exam) => ({
        id: exam.id,
        label: exam.name,
        subtitle: `${exam.lab} · ${exam.status}`,
        href: "/exame",
        type: "Exame",
      }));

    return [...patientResults, ...tutorResults, ...appointmentResults, ...examResults].slice(0, 8);
  }, [appointments, exams, patients, query, tutors]);

  return (
    <Modal open={searchOpen} onClose={() => setSearchOpen(false)} title="Buscar no sistema" size="lg">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center gap-3">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar paciente, tutor, atendimento, exame..."
            className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {results.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
            Nenhum resultado para “{query || "pesquisa"}”.
          </div>
        ) : (
          results.map((result) => (
            <button
              key={`${result.type}-${result.id}`}
              type="button"
              onClick={() => {
                setSearchOpen(false);
                router.push(result.href);
              }}
              className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:border-emerald-200 hover:bg-emerald-50/50"
            >
              <div>
                <div className="text-sm font-semibold text-slate-800">{result.label}</div>
                <div className="text-xs text-slate-500">{result.subtitle}</div>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="rounded-full bg-slate-100 px-2 py-1">{result.type}</span>
                <ArrowRight className="h-4 w-4" />
              </div>
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}
