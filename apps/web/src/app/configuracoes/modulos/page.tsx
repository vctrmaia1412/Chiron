"use client";

import { Check, Sparkles } from "lucide-react";
import { useApp } from "@/context/AppContext";

export default function ModulesPage() {
  const { modules, toggleModule } = useApp();

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 md:px-6 xl:px-8">
      <div className="mb-6">
        <div className="text-sm uppercase tracking-[0.2em] text-slate-400">Configurações</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Módulos</h1>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((module) => (
          <div key={module.id} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
            <div className="mb-4 flex items-center justify-between">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                <Sparkles className="h-4 w-4" />
              </div>
              <button
                type="button"
                onClick={() => toggleModule(module.id)}
                className={`relative h-6 w-11 rounded-full ${module.status === "Ativo" ? "bg-[#0F766E]" : "bg-slate-200"}`}
                aria-label={`Alternar módulo ${module.name}`}
              >
                <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${module.status === "Ativo" ? "left-6" : "left-1"}`} />
              </button>
            </div>

            <div className="text-xl font-semibold text-slate-900">{module.name}</div>
            <p className="mt-2 text-sm text-slate-600">{module.description}</p>

            <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
              <span className="text-sm text-slate-500">Status</span>
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${module.status === "Ativo" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                {module.status === "Ativo" ? <Check className="h-3 w-3" /> : null}
                {module.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
