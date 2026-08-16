"use client";

import { Bell, HelpCircle, Search, ChevronsUpDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "@/context/AppContext";
import { NotificationPanel } from "@/components/NotificationPanel";

export function Topbar() {
  const { organizations, currentOrgId, setCurrentOrgId, setSearchOpen, notifications, setNotificationsOpen, notificationsOpen } = useApp();
  const [orgMenuOpen, setOrgMenuOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setSearchOpen]);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 sm:px-4 md:px-6 xl:px-8">
        <div className="flex flex-1 items-center gap-2 sm:gap-3">
          <div className="lg:hidden">
            <Link href="/" className="text-base font-black tracking-[0.14em] text-[#0F766E]">CHIRON</Link>
          </div>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="hidden w-full max-w-xl items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 shadow-sm md:flex"
          >
            <Search className="h-4 w-4 text-slate-400" />
            <span className="flex-1 text-left text-sm text-slate-400">Buscar paciente, tutor, atendimento, exame...</span>
            <div className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">
              Ctrl + K
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 md:hidden"
            aria-label="Buscar no sistema"
          >
            <Search className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            aria-label="Central de ajuda"
            onClick={() => setSearchOpen(true)}
            className="hidden h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700 md:flex"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
          <div className="relative">
            <button
              type="button"
              aria-label="Notificações"
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
            >
              <Bell className="h-4 w-4" />
              {notifications.some((notification) => !notification.read) ? (
                <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
              ) : null}
            </button>
            <NotificationPanel />
          </div>

          <div className="relative hidden md:block">
            <button
              type="button"
              onClick={() => setOrgMenuOpen((prev) => !prev)}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0F766E] text-sm font-semibold text-white">FN</div>
              <div className="min-w-0 text-left">
                <div className="text-sm font-medium text-slate-800">Fábio N.</div>
                <div className="text-[11px] text-slate-500">{organizations.find((org) => org.id === currentOrgId)?.name ?? "Clínica Exemplo"}</div>
              </div>
              <ChevronsUpDown className="h-4 w-4 text-slate-400" />
            </button>

            {orgMenuOpen ? (
              <div className="absolute right-0 top-14 w-[240px] rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                {organizations.map((org) => (
                  <button
                    key={org.id}
                    type="button"
                    onClick={() => {
                      setCurrentOrgId(org.id);
                      setOrgMenuOpen(false);
                    }}
                    className={`w-full rounded-xl px-3 py-2 text-left text-sm ${currentOrgId === org.id ? "bg-[#E6F4F2] text-[#0F766E]" : "text-slate-700 hover:bg-slate-50"}`}
                  >
                    {org.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
