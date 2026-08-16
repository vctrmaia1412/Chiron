'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Search, X } from 'lucide-react';
import type { Guardian } from '@chiron/contracts';
import { api } from '@/lib/api';
import { formatPhone } from '@/lib/format';
import { Field, Input } from '@/components/ui/field';

/**
 * Seletor de tutor com busca no servidor. Não carrega a lista inteira: em
 * clínica com dez mil tutores isso seria inviável no celular.
 */
export function GuardianPicker({
  value,
  onChange,
  error,
  label = 'Tutor',
}: {
  value: { id: string; name: string } | null;
  onChange: (value: { id: string; name: string } | null) => void;
  error?: string;
  label?: string;
}) {
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term.trim()), 220);
    return () => clearTimeout(timer);
  }, [term]);

  const { data, isFetching } = useQuery({
    queryKey: ['guardians', 'picker', debounced],
    queryFn: () => api.get<{ items: Guardian[] }>('/guardians', { q: debounced, limit: 8 }),
    enabled: focused && debounced.length >= 2,
    staleTime: 15_000,
  });

  if (value) {
    return (
      <Field label={label} error={error}>
        <div className="flex items-center gap-2 rounded-[var(--radius)] border border-[var(--brand)] bg-[var(--brand-soft)] px-3 py-2.5">
          <Check className="h-4 w-4 shrink-0 text-[var(--brand)]" />
          <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-[var(--brand-ink)]">{value.name}</span>
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Trocar tutor"
            className="rounded-full p-1 text-[var(--brand-ink)] hover:bg-white/60"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </Field>
    );
  }

  const items = data?.items ?? [];

  return (
    <Field label={label} error={error}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-3)]" />
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 180)}
          placeholder="Nome, telefone ou CPF"
          className="pl-9"
          aria-invalid={Boolean(error)}
        />
        {focused && debounced.length >= 2 && (
          <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)]">
            {isFetching && items.length === 0 ? (
              <p className="px-3 py-3 text-[13px] text-[var(--ink-3)]">Buscando...</p>
            ) : items.length === 0 ? (
              <p className="px-3 py-3 text-[13px] text-[var(--ink-3)]">Nenhum tutor encontrado.</p>
            ) : (
              <ul>
                {items.map((guardian) => (
                  <li key={guardian.id}>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        onChange({ id: guardian.id, name: guardian.name });
                        setTerm('');
                      }}
                      className="flex w-full flex-col items-start px-3 py-2.5 text-left hover:bg-[var(--surface-2)]"
                    >
                      <span className="text-[14px] font-medium text-[var(--ink)]">{guardian.name}</span>
                      <span className="text-[12.5px] text-[var(--ink-3)]">
                        {[formatPhone(guardian.phonePrimary), guardian.documentMasked].filter(Boolean).join(' · ')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Field>
  );
}
