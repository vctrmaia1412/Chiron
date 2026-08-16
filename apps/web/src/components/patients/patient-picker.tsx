'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Search, X } from 'lucide-react';
import type { PatientListItem } from '@chiron/contracts';
import { api } from '@/lib/api';
import { formatWeight } from '@/lib/format';
import { Field, Input } from '@/components/ui/field';

export interface PatientPickerValue {
  id: string;
  name: string;
  guardianId?: string | null;
  speciesName?: string;
  weightKg?: string | null;
}

export function PatientPicker({
  value,
  onChange,
  error,
  label = 'Paciente',
}: {
  value: PatientPickerValue | null;
  onChange: (value: PatientPickerValue | null) => void;
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
    queryKey: ['patients', 'picker', debounced],
    queryFn: () => api.get<{ items: PatientListItem[] }>('/patients', { q: debounced, limit: 8, status: 'active' }),
    enabled: focused && debounced.length >= 2,
    staleTime: 15_000,
  });

  if (value) {
    return (
      <Field label={label} error={error}>
        <div className="flex items-center gap-2 rounded-[var(--radius)] border border-[var(--brand)] bg-[var(--brand-soft)] px-3 py-2.5">
          <Check className="h-4 w-4 shrink-0 text-[var(--brand)]" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-medium text-[var(--brand-ink)]">{value.name}</span>
            {value.speciesName && (
              <span className="block truncate text-[12px] text-[var(--brand-ink)]/70">
                {[value.speciesName, formatWeight(value.weightKg)].filter(Boolean).join(' · ')}
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Trocar paciente"
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
          placeholder="Nome do animal, número ou microchip"
          className="pl-9"
          aria-invalid={Boolean(error)}
        />
        {focused && debounced.length >= 2 && (
          <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)]">
            {isFetching && items.length === 0 ? (
              <p className="px-3 py-3 text-[13px] text-[var(--ink-3)]">Buscando...</p>
            ) : items.length === 0 ? (
              <p className="px-3 py-3 text-[13px] text-[var(--ink-3)]">Nenhum paciente encontrado.</p>
            ) : (
              <ul>
                {items.map((patient) => (
                  <li key={patient.id}>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        onChange({
                          id: patient.id,
                          name: patient.name,
                          speciesName: patient.speciesName,
                          weightKg: patient.currentWeightKg,
                        });
                        setTerm('');
                      }}
                      className="flex w-full flex-col items-start px-3 py-2.5 text-left hover:bg-[var(--surface-2)]"
                    >
                      <span className="text-[14px] font-medium text-[var(--ink)]">{patient.name}</span>
                      <span className="text-[12.5px] text-[var(--ink-3)]">
                        {[patient.speciesName, patient.breedName, patient.primaryGuardianName]
                          .filter(Boolean)
                          .join(' · ')}
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
