'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ClipboardList, PawPrint, Search, Users } from 'lucide-react';
import type { SearchResult } from '@chiron/contracts';
import { api } from '@/lib/api';
import { Sheet } from '@/components/ui/sheet';
import { Input } from '@/components/ui/field';
import { formatDateTime } from '@/lib/format';

const ICON: Record<SearchResult['type'], typeof PawPrint> = {
  patient: PawPrint,
  guardian: Users,
  appointment: CalendarDays,
  encounter: ClipboardList,
};

const GROUP_LABEL: Record<SearchResult['type'], string> = {
  patient: 'Pacientes',
  guardian: 'Tutores',
  appointment: 'Agendamentos',
  encounter: 'Atendimentos',
};

function GlobalSearchPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term.trim()), 220);
    return () => clearTimeout(timer);
  }, [term]);

  const { data, isFetching } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => api.get<{ items: SearchResult[] }>('/search', { q: debounced, limit: 8 }),
    enabled: open && debounced.length >= 2,
    staleTime: 10_000,
  });

  const items = data?.items ?? [];
  const groups = (['patient', 'guardian', 'encounter', 'appointment'] as const)
    .map((type) => ({ type, items: items.filter((item) => item.type === type) }))
    .filter((group) => group.items.length > 0);

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Buscar" size="md">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-3)]" />
        <Input
          autoFocus
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Nome, telefone, CPF, microchip ou número"
          className="pl-9"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && items[0]) go(items[0].href);
          }}
        />
      </div>

      <div className="mt-4 min-h-[180px]">
        {debounced.length < 2 ? (
          <p className="px-1 py-8 text-center text-[13.5px] text-[var(--ink-3)]">
            Digite ao menos duas letras. A busca cobre paciente, tutor, agendamento e número de atendimento.
          </p>
        ) : isFetching && items.length === 0 ? (
          <p className="px-1 py-8 text-center text-[13.5px] text-[var(--ink-3)]">Buscando...</p>
        ) : items.length === 0 ? (
          <p className="px-1 py-8 text-center text-[13.5px] text-[var(--ink-3)]">Nada encontrado para “{debounced}”.</p>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => {
              const Icon = ICON[group.type];
              return (
                <div key={group.type}>
                  <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                    {GROUP_LABEL[group.type]}
                  </p>
                  <ul className="space-y-0.5">
                    {group.items.map((item) => (
                      <li key={`${item.type}-${item.id}`}>
                        <button
                          type="button"
                          onClick={() => go(item.href)}
                          className="flex w-full items-center gap-3 rounded-[var(--radius)] px-2.5 py-2.5 text-left hover:bg-[var(--surface-2)]"
                        >
                          <Icon className="h-4 w-4 shrink-0 text-[var(--ink-3)]" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14px] font-medium text-[var(--ink)]">
                              {item.title}
                            </span>
                            {item.subtitle && (
                              <span className="block truncate text-[12.5px] text-[var(--ink-3)]">
                                {group.type === 'appointment' || group.type === 'encounter'
                                  ? formatDateTime(item.subtitle)
                                  : item.subtitle}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Sheet>
  );
}

export function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  // O atalho de teclado precisa existir mesmo com a busca fechada, então fica
  // aqui fora; o painel em si só monta ao abrir, com o campo já vazio.
  useSearchShortcut(onOpenChange);
  return open ? <GlobalSearchPanel open={open} onOpenChange={onOpenChange} /> : null;
}

function useSearchShortcut(onOpenChange: (open: boolean) => void) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typingInField =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (typingInField) return;
      if (event.key === '/' || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k')) {
        event.preventDefault();
        onOpenChange(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onOpenChange]);
}
