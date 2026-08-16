"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Home, MoreHorizontal, Plus, Stethoscope } from "lucide-react";
import { useState } from "react";
import { AppointmentFlowModal } from "@/components/AppointmentFlowModal";

export function MobileNav() {
  const pathname = usePathname();
  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false);

  const isActive = (href: string) => pathname === href;

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1.5 backdrop-blur-xl shadow-[0_-12px_30px_rgba(15,23,42,0.04)] lg:hidden">
        <div className="mx-auto grid max-w-[420px] grid-cols-[1fr_1fr_64px_1fr_1fr] items-center justify-items-center gap-1 px-2">
          <Link href="/" className={`flex flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-medium ${isActive("/") ? "text-emerald-700" : "text-slate-500"}`}>
            <Home className="h-4 w-4" />
            Início
          </Link>
          <Link href="/pacientes" className={`flex flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-medium ${isActive("/pacientes") ? "text-emerald-700" : "text-slate-500"}`}>
            <Stethoscope className="h-4 w-4" />
            Pacientes
          </Link>
          <button
            type="button"
            onClick={() => setAppointmentModalOpen(true)}
            className="col-start-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#0F766E] text-white shadow-lg shadow-emerald-900/20"
            aria-label="Abrir novo atendimento"
          >
            <Plus className="h-5 w-5" />
          </button>
          <Link href="/agenda" className={`flex flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-medium ${isActive("/agenda") ? "text-emerald-700" : "text-slate-500"}`}>
            <CalendarDays className="h-4 w-4" />
            Agenda
          </Link>
          <Link href="/configuracoes/modulos" className={`flex flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-medium ${isActive("/configuracoes/modulos") ? "text-emerald-700" : "text-slate-500"}`}>
            <MoreHorizontal className="h-4 w-4" />
            Mais
          </Link>
        </div>
      </nav>

      <AppointmentFlowModal open={appointmentModalOpen} onClose={() => setAppointmentModalOpen(false)} />
    </>
  );
}
