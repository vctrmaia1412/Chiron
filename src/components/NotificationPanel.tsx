"use client";

import { BellRing, Clock3, FileText, ShieldAlert, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { useApp } from "@/context/AppContext";

const notificationIcons = {
  Exame: FileText,
  Retorno: Clock3,
  Estoque: ShieldAlert,
  default: BellRing,
};

export function NotificationPanel() {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const { notifications, notificationsOpen, setNotificationsOpen, markNotificationRead, markAllNotificationsRead } = useApp();

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications],
  );

  useEffect(() => {
    if (!notificationsOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNotificationsOpen(false);
      }
    };

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const toggleButton = target?.closest('[aria-label="Notificações"]');
      if (toggleButton) return;

      if (panelRef.current && !panelRef.current.contains(target)) {
        setNotificationsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [notificationsOpen, setNotificationsOpen]);

  if (!notificationsOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-slate-950/15 md:hidden" aria-hidden="true" onClick={() => setNotificationsOpen(false)} />

      <aside
        ref={panelRef}
        role="dialog"
        aria-label="Notificações"
        className="fixed inset-x-0 top-0 z-[90] flex h-dvh flex-col overflow-hidden border-b border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.18)] md:inset-auto md:right-4 md:top-[4.75rem] md:h-auto md:max-h-[calc(100dvh-6rem)] md:w-[380px] md:rounded-[28px] md:border md:border-slate-200 md:shadow-[0_18px_50px_rgba(15,23,42,0.14)]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:px-5 md:pt-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
              <BellRing className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold text-slate-900">Notificações</div>
              <div className="text-xs text-slate-500">{unreadCount} não lida{unreadCount === 1 ? "" : "s"}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={markAllNotificationsRead}
                className="hidden rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10px] font-medium text-slate-700 transition hover:border-slate-300 md:inline-flex"
              >
                Marcar todas como lidas
              </button>
            ) : null}
            <button
              type="button"
              aria-label="Fechar notificações"
              onClick={() => setNotificationsOpen(false)}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-3 pt-3 sm:px-4 md:pb-4 md:pt-4">
          <div className="space-y-3">
            {notifications.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                Nenhuma notificação no momento.
              </div>
            ) : (
              notifications.map((notification) => {
                const Icon = notificationIcons[notification.title.includes("Exame") ? "Exame" : notification.title.includes("Retorno") ? "Retorno" : notification.title.includes("Estoque") ? "Estoque" : "default"];

                return (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => {
                      markNotificationRead(notification.id);
                      setNotificationsOpen(false);
                    }}
                    className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition-colors duration-200 ${notification.read ? "border-slate-200 bg-slate-50" : "border-emerald-200 bg-white"}`}
                  >
                    <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${notification.read ? "bg-slate-100 text-slate-500 ring-slate-200" : "bg-emerald-50 text-emerald-700 ring-emerald-100"}`}>
                      <Icon className="h-4 w-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-900">{notification.title}</div>
                          <div className="mt-1 line-clamp-2 overflow-wrap-anywhere break-words text-xs leading-5 text-slate-600">{notification.description}</div>
                        </div>
                        {!notification.read ? (
                          <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" aria-label="Notificação não lida" />
                        ) : null}
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.16em] text-slate-500">
                          {notification.read ? "Lida" : "Nova"}
                        </span>
                        <span className="text-[10px] uppercase tracking-[0.18em] text-slate-400">{notification.time}</span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 md:px-5">
          <button
            type="button"
            onClick={() => setNotificationsOpen(false)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300"
          >
            Ver todas
          </button>
        </div>
      </aside>
    </>
  );
}
