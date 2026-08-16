"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BriefcaseMedical,
  CalendarDays,
  ChevronRight,
  FileText,
  LayoutDashboard,
  Pill,
  Settings,
  Stethoscope,
  Syringe,
  Warehouse,
  CircleDashed,
} from "lucide-react";
import { useApp } from "@/context/AppContext";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/pacientes", label: "Pacientes", icon: Stethoscope },
  { href: "/atendimentos", label: "Atendimentos", icon: BriefcaseMedical },
  { href: "/prontuarios", label: "Prontuários", icon: FileText },
  { href: "/exame", label: "Exames", icon: Activity },
  { href: "/receita", label: "Receitas", icon: Pill },
  { href: "/internacao", label: "Internação", icon: Syringe },
  { href: "/estoque", label: "Estoque", icon: Warehouse },
  { href: "/financeiro", label: "Financeiro", icon: CircleDashed },
  { href: "/relatorios", label: "Relatórios", icon: FileText },
];

const settingsItems = [{ href: "/configuracoes/modulos", label: "Configurações", icon: Settings }];

export function Sidebar() {
  const pathname = usePathname();
  const { modules } = useApp();

  const activeIds = new Set(modules.filter((module) => module.status === "Ativo").map((module) => module.id));

  const filteredNav = navItems.filter((item) => {
    const key = item.href.replace("/", "").split("/")[0] || "dashboard";
    if (["agenda", "pacientes", "atendimentos", "prontuarios", "exame", "receita"].includes(key)) return true;
    if (!["internacao", "estoque", "financeiro", "relatorios"].includes(key)) return true;
    return activeIds.has(key);
  });

  return (
    <aside className="hidden min-h-screen w-[280px] flex-col bg-[#103f3d] px-5 py-6 text-slate-100 lg:flex">
      <div className="mb-8 flex items-center gap-3 px-2">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 text-lg font-black text-white shadow-lg shadow-emerald-900/20">
          C
        </div>
        <div>
          <div className="text-xl font-semibold tracking-[0.12em] text-white">CHIRON</div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-emerald-200/80">Veterinary Platform</div>
        </div>
      </div>

      <nav className="space-y-1">
        {filteredNav.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={[
                "group flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition-all",
                isActive ? "bg-[#E6F4F2] text-[#0F766E] shadow-sm" : "text-slate-200 hover:bg-white/5 hover:text-white",
              ].join(" ")}
            >
              <span className="flex items-center gap-3">
                <Icon className="h-4 w-4" />
                {label}
              </span>
              <ChevronRight className={isActive ? "h-4 w-4 text-[#0F766E]" : "h-4 w-4 text-slate-400 group-hover:text-slate-200"} />
            </Link>
          );
        })}
      </nav>

      <div className="mt-8 border-t border-white/10 pt-5">
        <div className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-300">Configurações</div>
        {settingsItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={[
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all",
                isActive ? "bg-[#E6F4F2] text-[#0F766E]" : "text-slate-200 hover:bg-white/5 hover:text-white",
              ].join(" ")}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
