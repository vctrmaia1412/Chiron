"use client";

import { Search, SlidersHorizontal, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { PatientCard } from "@/components/PatientCard";
import { PatientForm } from "@/components/PatientForms";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useApp } from "@/context/AppContext";

export default function PatientsPage() {
  const { patients, deletePatient, addToast } = useApp();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [formOpen, setFormOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filteredPatients = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return patients.filter((patient) => {
      const matchesQuery =
        normalized.length === 0 ||
        `${patient.name} ${patient.owner} ${patient.specie} ${patient.breed}`.toLowerCase().includes(normalized);

      const matchesStatus = statusFilter === "Todos" || patient.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [patients, query, statusFilter]);

  const handleDelete = () => {
    if (!deleteId) return;
    deletePatient(deleteId);
    addToast("Paciente removido", "O paciente foi excluído do cadastro.", "success");
    setDeleteId(null);
  };

  const cycleStatusFilter = () => {
    const options = ["Todos", "Ativo", "Retorno", "Atenção"];
    const currentIndex = options.indexOf(statusFilter);
    const next = options[(currentIndex + 1) % options.length];
    setStatusFilter(next);
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-4 md:px-6 xl:px-8">
      <div className="mb-4 flex flex-col gap-3 sm:mb-5 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400 sm:text-[11px]">Pacientes</div>
          <h1 className="mt-2 text-[1.7rem] font-semibold tracking-tight text-slate-900 sm:text-3xl">Lista de pacientes</h1>
        </div>
        <button type="button" onClick={() => setFormOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0F766E] px-3.5 py-2.5 text-sm font-medium text-white shadow-md shadow-emerald-900/10 transition hover:bg-[#115E59]">
          <Plus className="h-4 w-4" />
          Novo paciente
        </button>
      </div>

      <div className="mb-4 rounded-3xl border border-slate-200 bg-white p-3 shadow-[0_10px_30px_rgba(15,23,42,0.04)] sm:mb-6 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              aria-label="Buscar pacientes"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar paciente, tutor ou espécie..."
              className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={cycleStatusFilter} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
              <SlidersHorizontal className="h-4 w-4" />
              Filtros
            </button>
            {['Todos', 'Ativo', 'Retorno', 'Atenção'].map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`rounded-xl border px-3 py-2 text-sm ${statusFilter === status ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600"}`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filteredPatients.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white/60 p-8 text-center text-sm text-slate-500">
          Nenhum paciente encontrado para esta busca.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {filteredPatients.map((patient) => (
            <div key={patient.id} className="relative">
              <PatientCard patient={patient} />
              <button
                type="button"
                onClick={() => setDeleteId(patient.id)}
                className="absolute right-3 top-3 rounded-lg border border-red-200 bg-white px-2 py-1 text-[10px] font-medium text-red-600"
              >
                Excluir
              </button>
            </div>
          ))}
        </div>
      )}

      <PatientForm open={formOpen} onClose={() => setFormOpen(false)} />
      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Excluir paciente"
        description="Essa ação remove o cadastro do paciente e não pode ser desfeita."
        onCancel={() => setDeleteId(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
