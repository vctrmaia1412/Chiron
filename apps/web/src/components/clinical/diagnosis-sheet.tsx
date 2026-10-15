'use client';

import { useState } from 'react';
import { useDebounced } from '@/lib/use-debounced';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Search } from 'lucide-react';
import type { ConditionSuggestion } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { useConditionSearch } from '@/lib/charting';
import { cn } from '@/lib/cn';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { MountWhenOpen } from '@/components/ui/mount-when-open';

const KINDS = [
  ['presumptive', 'Presuntivo'],
  ['final', 'Definitivo'],
  ['differential', 'Diferencial'],
  ['ruled_out', 'Descartado'],
] as const;

const PROBLEM = [
  ['none', 'Só nesta consulta'],
  ['active', 'Problema ativo'],
  ['chronic', 'Crônico'],
] as const;

function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: ReadonlyArray<readonly [T, string]>;
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map(([key, text]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={cn(
            'rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors',
            value === key
              ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-ink)]'
              : 'border-[var(--border-strong)] text-[var(--ink-2)] hover:bg-[var(--surface-2)]',
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/**
 * Diagnóstico com busca no catálogo e no que a clínica já usou. O texto livre
 * continua valendo: a busca é atalho, não obrigação. Levar para a lista de
 * problemas faz o diagnóstico aparecer no resumo das próximas consultas.
 */
function DiagnosisSheetContent({
  open,
  onOpenChange,
  encounterId,
  patientId,
  speciesId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  encounterId: string;
  patientId: string;
  speciesId: string | null;
}) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<ConditionSuggestion | null>(null);
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>('presumptive');
  const [problem, setProblem] = useState<(typeof PROBLEM)[number][0]>('none');
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);

  const deferred = useDebounced(query.trim(), 200);
  const { data: suggestions = [], isFetching } = useConditionSearch(deferred, speciesId, open && !chosen);

  const description = (chosen?.name ?? query).trim();

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/encounters/${encounterId}/diagnoses`, {
        description,
        conditionId: chosen?.id ?? undefined,
        kind,
        notes: notes.trim() || undefined,
        addToProblems: problem === 'none' ? undefined : problem,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['encounter', encounterId] });
      if (problem !== 'none') await queryClient.invalidateQueries({ queryKey: ['patient-summary', patientId] });
      toast.success(problem === 'none' ? 'Diagnóstico registrado.' : 'Diagnóstico registrado e incluído nos problemas.');
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Diagnóstico"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} className="sm:w-auto">
            Cancelar
          </Button>
          <Button
            onClick={() => {
              if (description.length < 3) {
                toast.error('Descreva o diagnóstico.');
                return;
              }
              mutation.mutate();
            }}
            loading={mutation.isPending}
            className="sm:w-auto"
          >
            Registrar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {chosen ? (
          <div className="flex items-center justify-between gap-2 rounded-[var(--radius)] border border-[var(--brand)]/30 bg-[var(--brand-soft)] px-3 py-2.5">
            <span className="text-[14.5px] font-medium text-[var(--brand-ink)]">{chosen.name}</span>
            <button
              type="button"
              onClick={() => {
                setQuery(chosen.name);
                setChosen(null);
              }}
              className="text-[12.5px] font-medium text-[var(--brand)]"
            >
              Trocar
            </button>
          </div>
        ) : (
          <div>
            <label htmlFor="diagnosis-search" className="sr-only">
              Diagnóstico
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-3)]" />
              <Input
                data-sheet-ignore
                id="diagnosis-search"
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar ou escrever: otite, gastroenterite, mastite..."
                className="pl-9"
                autoComplete="off"
              />
            </div>
            <ul className="mt-2 max-h-64 overflow-y-auto" aria-busy={isFetching}>
              {!deferred && suggestions.length > 0 && (
                <li className="px-1 pb-1 text-[11.5px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                  Mais usados na clínica
                </li>
              )}
              {suggestions.map((suggestion) => (
                <li key={`${suggestion.id ?? 'h'}-${suggestion.name}`}>
                  <button
                    type="button"
                    onClick={() => setChosen(suggestion)}
                    className="flex w-full items-center justify-between gap-2 rounded-[var(--radius)] px-2.5 py-2.5 text-left hover:bg-[var(--surface-2)]"
                  >
                    <span className="text-[14px] text-[var(--ink)]">{suggestion.name}</span>
                    {suggestion.source === 'history' && (
                      <span className="shrink-0 text-[11px] text-[var(--ink-3)]">já usado</span>
                    )}
                  </button>
                </li>
              ))}
              {deferred.length >= 3 &&
                !suggestions.some((item) => item.name.toLowerCase() === deferred.toLowerCase()) && (
                  <li>
                    <button
                      type="button"
                      onClick={() => setChosen({ id: null, name: deferred, source: 'history' })}
                      className="w-full rounded-[var(--radius)] px-2.5 py-2.5 text-left text-[13.5px] text-[var(--brand)] hover:bg-[var(--surface-2)]"
                    >
                      Usar “{deferred}” como escrito
                    </button>
                  </li>
                )}
            </ul>
          </div>
        )}

        <Field label="Classificação">
          <Segmented label="Classificação" options={KINDS} value={kind} onChange={setKind} />
        </Field>

        <Field label="Acompanhamento" hint="Problemas aparecem no resumo do paciente nas próximas consultas.">
          <Segmented label="Acompanhamento" options={PROBLEM} value={problem} onChange={setProblem} />
        </Field>

        {showNotes ? (
          <Field label="Observação" htmlFor="diagnosis-notes">
            <Textarea id="diagnosis-notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} />
          </Field>
        ) : (
          <button type="button" onClick={() => setShowNotes(true)} className="text-[13px] font-medium text-[var(--brand)]">
            + Observação
          </button>
        )}
      </div>
    </Sheet>
  );
}

export function DiagnosisSheet(props: React.ComponentProps<typeof DiagnosisSheetContent>) {
  return (
    <MountWhenOpen open={props.open}>
      <DiagnosisSheetContent {...props} />
    </MountWhenOpen>
  );
}
