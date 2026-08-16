"use client";

import { FileSearch, FlaskConical, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";

export default function ExamesPage() {
  const { exams } = useApp();
  const [statusFilter] = useState(() => {
    if (typeof window === "undefined") return "all";
    const params = new URLSearchParams(window.location.search);
    return params.get("status") ?? "all";
  });

  const filteredExams = useMemo(() => {
    if (statusFilter === "pending") {
      return exams.filter((exam) => !["Resultado disponível", "Revisado"].includes(exam.status));
    }

    if (statusFilter === "all") {
      return exams;
    }

    return exams.filter((exam) => exam.status === statusFilter);
  }, [exams, statusFilter]);

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6 xl:px-8">
      <div className="mb-6">
        <div className="text-sm uppercase tracking-[0.2em] text-slate-400">Exames</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Solicitações e resultados</h1>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {filteredExams.map((exam) => (
          <div key={exam.id} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
            <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
              {exam.status === "Resultado disponível" || exam.status === "Revisado" ? <ShieldCheck className="h-4 w-4" /> : exam.status === "Coleta realizada" ? <FlaskConical className="h-4 w-4" /> : <FileSearch className="h-4 w-4" />}
            </div>
            <div className="text-xl font-semibold text-slate-900">{exam.name}</div>
            <div className="mt-3 text-sm text-slate-500">{exam.lab} • {exam.priority}</div>
            <div className="mt-5 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{exam.status}</div>
          </div>
        ))}
      </div>

      {filteredExams.length === 0 ? (
        <div className="mt-6 rounded-[28px] border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Nenhum exame encontrado para este filtro.
        </div>
      ) : null}
    </div>
  );
}
