'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bell, ScanLine, Search } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Notification } from '@chiron/contracts';
import { api } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Logo } from '@/components/brand/logo';
import { Sheet } from '@/components/ui/sheet';
import { EmptyState } from '@/components/ui/primitives';
import { GlobalSearch } from '@/components/search/global-search';
import { ScanDialog } from '@/components/search/scan-dialog';

export function Topbar() {
  const { can, hasModule } = useSession();
  const [searchOpen, setSearchOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-20 flex h-[var(--header-h)] items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)]/95 px-3 backdrop-blur md:px-5">
      <Logo className="h-6 lg:hidden" />

      {can('search:use') && (
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="ml-auto flex h-9 items-center gap-2 rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 text-[13.5px] text-[var(--ink-3)] transition-colors hover:border-[var(--brand)] hover:text-[var(--ink-2)] lg:ml-0 lg:w-[340px]"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="hidden lg:inline">Buscar paciente, tutor, atendimento</span>
          <span className="lg:hidden">Buscar</span>
          <kbd className="ml-auto hidden rounded border border-[var(--border-strong)] bg-[var(--surface)] px-1.5 py-0.5 text-[11px] lg:inline">
            /
          </kbd>
        </button>
      )}

      <div className="ml-auto flex items-center gap-1">
        {can('search:use') && (
          <button
            type="button"
            onClick={() => setScanOpen(true)}
            aria-label="Ler código"
            className="flex h-9 w-9 items-center justify-center rounded-[var(--radius)] text-[var(--ink-3)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
          >
            <ScanLine className="h-[18px] w-[18px]" />
          </button>
        )}

        {hasModule('comms') && can('notification:read') && (
          <NotificationButton onOpen={() => setNotificationsOpen(true)} />
        )}
      </div>

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
      <ScanDialog open={scanOpen} onOpenChange={setScanOpen} />
      <NotificationSheet open={notificationsOpen} onOpenChange={setNotificationsOpen} />
    </header>
  );
}

function NotificationButton({ onOpen }: { onOpen: () => void }) {
  const { data } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => api.get<{ items: Notification[]; unread: number }>('/notifications', { unread: true, limit: 1 }),
    refetchInterval: 60_000,
  });

  const unread = data?.unread ?? 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={unread > 0 ? `${unread} notificações não lidas` : 'Notificações'}
      className="relative flex h-9 w-9 items-center justify-center rounded-[var(--radius)] text-[var(--ink-3)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
    >
      <Bell className="h-[18px] w-[18px]" />
      {unread > 0 && (
        <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[10px] font-semibold text-white">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  );
}

function NotificationSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => api.get<{ items: Notification[]; unread: number }>('/notifications', { limit: 30 }),
    enabled: open,
  });

  async function markAllRead() {
    await api.post('/notifications/read-all');
    await queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }

  const items = data?.items ?? [];

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Notificações"
      size="sm"
      footer={
        items.some((item) => !item.readAt) ? (
          <button
            type="button"
            onClick={() => void markAllRead()}
            className="h-11 rounded-[var(--radius)] border border-[var(--border-strong)] px-4 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--surface-2)] sm:h-10"
          >
            Marcar todas como lidas
          </button>
        ) : undefined
      }
    >
      {isLoading ? (
        <p className="py-6 text-center text-sm text-[var(--ink-3)]">Carregando...</p>
      ) : items.length === 0 ? (
        <EmptyState title="Nenhuma notificação" description="Você está em dia." />
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {items.map((item) => {
            const content = (
              <div className="flex gap-3 py-3">
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    item.readAt ? 'bg-transparent' : 'bg-[var(--brand)]'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-[var(--ink)]">{item.title}</p>
                  {item.body && <p className="mt-0.5 text-[13px] text-[var(--ink-2)]">{item.body}</p>}
                  <p className="mt-1 text-[12px] text-[var(--ink-3)]">{relativeTime(item.createdAt)}</p>
                </div>
              </div>
            );
            return (
              <li key={item.id}>
                {item.link ? (
                  <Link href={item.link} onClick={() => onOpenChange(false)} className="block">
                    {content}
                  </Link>
                ) : (
                  content
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
