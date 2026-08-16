import Link from "next/link";
import { ArrowUpRight, HeartPulse } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { Patient } from "@/mocks/data";

export function PatientCard({ patient }: { patient: Patient }) {
  return (
    <Link href={`/pacientes/${patient.id}`} className="group block rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_10px_30px_rgba(15,23,42,0.03)] transition hover:border-emerald-200 hover:shadow-md sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-semibold text-white sm:h-12 sm:w-12 sm:text-base ${patient.avatarColor}`}>
            {patient.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="truncate text-base font-semibold text-slate-900">{patient.name}</div>
              <HeartPulse className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500 sm:text-xs">{patient.breed}</div>
          </div>
        </div>
        <StatusBadge label={patient.status} tone={patient.status === "Retorno" ? "warning" : patient.status === "Atenção" ? "info" : "success"} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-600 sm:gap-3 sm:text-sm">
        <div>
          <div className="text-slate-400">Espécie</div>
          <div className="mt-1 font-medium text-slate-800">{patient.specie}</div>
        </div>
        <div>
          <div className="text-slate-400">Sexo</div>
          <div className="mt-1 font-medium text-slate-800">{patient.sex}</div>
        </div>
        <div>
          <div className="text-slate-400">Idade</div>
          <div className="mt-1 font-medium text-slate-800">{patient.age}</div>
        </div>
        <div>
          <div className="text-slate-400">Peso</div>
          <div className="mt-1 font-medium text-slate-800">{patient.weight}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Tutor</div>
          <div className="mt-1 truncate text-xs font-medium text-slate-700 sm:text-sm">{patient.owner}</div>
        </div>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-emerald-600" />
      </div>
    </Link>
  );
}
