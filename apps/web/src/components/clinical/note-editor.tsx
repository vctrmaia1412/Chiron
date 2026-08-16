'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Loader2 } from 'lucide-react';
import type { EncounterNote } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { NOTE_KIND, labelFor } from '@/lib/labels';
import { Textarea } from '@/components/ui/field';

const SECTIONS = ['chief_complaint', 'history', 'physical_exam', 'assessment', 'plan'] as const;

const PLACEHOLDER: Record<string, string> = {
  chief_complaint: 'O que trouxe o paciente hoje, na descrição do tutor.',
  history: 'Histórico, alimentação, ambiente, vacinação, medicações em uso.',
  physical_exam: 'Achados do exame físico por sistema.',
  assessment: 'Interpretação clínica dos achados.',
  plan: 'Conduta, orientações ao tutor e critérios de retorno.',
};

/**
 * Editor por seção com salvamento automático. Cada seção é uma nota própria
 * no banco, então a evolução fica granular e a assinatura acontece por nota
 * na finalização, não em um bloco único de texto.
 */
export function NoteEditor({ encounterId, notes }: { encounterId: string; notes: EncounterNote[] }) {
  return (
    <div className="space-y-3">
      {SECTIONS.map((kind) => (
        <NoteSection
          key={kind}
          encounterId={encounterId}
          kind={kind}
          existing={notes.find((note) => note.kind === kind) ?? null}
        />
      ))}
    </div>
  );
}

function NoteSection({
  encounterId,
  kind,
  existing,
}: {
  encounterId: string;
  kind: string;
  existing: EncounterNote | null;
}) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(existing?.body ?? '');
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locked = existing?.status === 'final' || existing?.status === 'amended';

  useEffect(() => {
    if (!dirty) setValue(existing?.body ?? '');
  }, [existing?.body, dirty]);

  const mutation = useMutation({
    mutationFn: (body: string) => api.post(`/encounters/${encounterId}/notes`, { kind, body }),
    onSuccess: async () => {
      setDirty(false);
      setSavedAt(Date.now());
      await queryClient.invalidateQueries({ queryKey: ['encounter', encounterId] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  function scheduleSave(next: string) {
    setValue(next);
    setDirty(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (next.trim() === (existing?.body ?? '').trim()) {
        setDirty(false);
        return;
      }
      mutation.mutate(next);
    }, 1200);
  }

  function saveNow() {
    if (timer.current) clearTimeout(timer.current);
    if (!dirty) return;
    if (value.trim() === (existing?.body ?? '').trim()) {
      setDirty(false);
      return;
    }
    mutation.mutate(value);
  }

  useEffect(() => () => (timer.current ? clearTimeout(timer.current) : undefined), []);

  if (locked) {
    return (
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-3">
        <p className="mb-1 text-[12px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
          {labelFor(NOTE_KIND, kind)} · assinada
        </p>
        <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--ink)]">{existing?.body}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-[12px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
          {labelFor(NOTE_KIND, kind)}
        </label>
        <span className="flex items-center gap-1 text-[11.5px] text-[var(--ink-3)]">
          {mutation.isPending ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              salvando
            </>
          ) : dirty ? (
            'alterações não salvas'
          ) : savedAt ? (
            <>
              <Check className="h-3 w-3 text-[var(--success)]" />
              salvo
            </>
          ) : null}
        </span>
      </div>
      <Textarea
        value={value}
        onChange={(event) => scheduleSave(event.target.value)}
        onBlur={saveNow}
        rows={kind === 'physical_exam' || kind === 'history' ? 4 : 3}
        placeholder={PLACEHOLDER[kind]}
      />
    </div>
  );
}
