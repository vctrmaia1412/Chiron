'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, CircleDashed, ClipboardCheck, Loader2, Mic, MicOff, NotebookPen, RotateCw } from 'lucide-react';
import { recordCompleteness, suggestTemplate } from '@chiron/domain';
import type { ChartingSection, EncounterNote, NoteTemplate } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { useNoteTemplates } from '@/lib/charting';
import { useDictation } from '@/lib/use-dictation';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { SmartTextarea, type SmartTextareaHandle } from './smart-textarea';
import { PhysicalExamSheet } from './physical-exam-sheet';
import { TemplatesSheet } from './templates-sheet';

export const SECTIONS: ReadonlyArray<{ kind: ChartingSection; label: string; placeholder: string; rows: number }> = [
  { kind: 'chief_complaint', label: 'Queixa principal', placeholder: 'O que trouxe o paciente, nas palavras do tutor.', rows: 1 },
  {
    kind: 'history',
    label: 'Anamnese',
    placeholder: 'Histórico, alimentação, vacinação, medicações em uso. Digite / para atalhos.',
    rows: 2,
  },
  {
    kind: 'physical_exam',
    label: 'Exame físico',
    placeholder: 'Achados por sistema. Use "Exame normal" para preencher o que não tem alteração.',
    rows: 2,
  },
  { kind: 'assessment', label: 'Avaliação', placeholder: 'Interpretação clínica e diagnóstico presuntivo.', rows: 1 },
  { kind: 'plan', label: 'Conduta', placeholder: 'Tratamento, orientações ao tutor e quando retornar.', rows: 2 },
];

type Drafts = Record<ChartingSection, string>;
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function initialDrafts(notes: EncounterNote[]): Drafts {
  const result = {} as Drafts;
  for (const section of SECTIONS) {
    result[section.kind] = notes.find((note) => note.kind === section.kind)?.body ?? '';
  }
  return result;
}

/**
 * O registro clínico como um documento só, dividido em seções leves. Nada é
 * obrigatório aqui: modelos, atalhos com barra, exame físico normal em um
 * toque e ditado existem para o veterinário escrever menos, e o indicador de
 * conteúdo mínimo só avisa, nunca trava.
 *
 * O texto vive neste componente enquanto o atendimento está aberto. Cada seção
 * salva sozinha depois de uma pausa na digitação, em fila por seção, para que
 * uma resposta lenta da rede nunca grave por cima de um texto mais novo.
 */
export function NoteEditor({
  encounterId,
  notes,
  triageNotes,
  speciesId,
  speciesCode,
  speciesName,
  serviceCategory,
  observationCount,
  diagnosisCount,
  onFirstEdit,
  flushRef,
}: {
  encounterId: string;
  notes: EncounterNote[];
  triageNotes: EncounterNote[];
  speciesId: string | null;
  speciesCode: string | null;
  speciesName: string | null;
  serviceCategory: string | null;
  observationCount: number;
  diagnosisCount: number;
  /** Chamado na primeira edição: o atendimento começa sem precisar de um botão. */
  onFirstEdit?: () => void;
  /**
   * Recebe a função que grava tudo o que ainda está pendente e espera a
   * resposta. A finalização chama antes de assinar: sem isso, a última frase
   * digitada um segundo antes do toque ficaria fora do registro assinado.
   */
  flushRef?: React.RefObject<(() => Promise<boolean>) | null>;
}) {
  const queryClient = useQueryClient();
  const { data: templates = [] } = useNoteTemplates(speciesId);
  const [drafts, setDrafts] = useState<Drafts>(() => initialDrafts(notes));
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [failed, setFailed] = useState<Set<ChartingSection>>(() => new Set());
  const [activeSection, setActiveSection] = useState<ChartingSection>('history');
  const [examOpen, setExamOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const fields = useRef<Partial<Record<ChartingSection, SmartTextareaHandle | null>>>({});
  const timers = useRef<Partial<Record<ChartingSection, ReturnType<typeof setTimeout>>>>({});
  const queues = useRef<Partial<Record<ChartingSection, Promise<unknown>>>>({});
  // Espelhos do estado para os manipuladores: várias seções podem mudar no
  // mesmo toque (um modelo preenche quatro), e cada mudança precisa partir do
  // valor mais novo, não do que estava na última renderização.
  const latest = useRef<Drafts | null>(null);
  const saved = useRef<Drafts | null>(null);
  const failedKinds = useRef<Set<ChartingSection>>(new Set());
  const pending = useRef(0);
  const started = useRef(false);

  function currentDrafts(): Drafts {
    latest.current ??= initialDrafts(notes);
    return latest.current;
  }

  function savedDrafts(): Drafts {
    saved.current ??= initialDrafts(notes);
    return saved.current;
  }

  function markFailed(kind: ChartingSection, failedNow: boolean) {
    const next = new Set(failedKinds.current);
    if (failedNow) next.add(kind);
    else next.delete(kind);
    failedKinds.current = next;
    setFailed(next);
  }

  useEffect(() => {
    const scheduled = timers.current;
    return () => {
      for (const timer of Object.values(scheduled)) if (timer) clearTimeout(timer);
    };
  }, []);

  const persist = useCallback(
    (kind: ChartingSection, body: string) => {
      if (body.trim() === savedDrafts()[kind].trim()) return;
      pending.current += 1;
      setSaveState('saving');

      const previous = queues.current[kind] ?? Promise.resolve();
      const next = previous
        .catch(() => undefined)
        .then(() => api.post(`/encounters/${encounterId}/notes`, { kind, body }))
        .then(() => {
          saved.current = { ...savedDrafts(), [kind]: body };
          if (failedKinds.current.has(kind)) markFailed(kind, false);
        })
        .catch((error: unknown) => {
          markFailed(kind, true);
          toast.error(`${errorMessage(error)} O texto continua na tela; tente salvar de novo.`);
        })
        .finally(() => {
          pending.current -= 1;
          if (pending.current === 0) {
            setSaveState(failedKinds.current.size > 0 ? 'error' : 'saved');
            void queryClient.invalidateQueries({ queryKey: ['encounter', encounterId] });
          }
        });
      queues.current[kind] = next;
    },
    // savedDrafts e markFailed só tocam refs e um setter estável
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [encounterId, queryClient],
  );

  const schedule = useCallback(
    (kind: ChartingSection, body: string, delay = 1000) => {
      const current = timers.current[kind];
      if (current) clearTimeout(current);
      timers.current[kind] = setTimeout(() => persist(kind, body), delay);
    },
    [persist],
  );

  const setSection = useCallback(
    (kind: ChartingSection, updater: (current: string) => string, delay?: number) => {
      if (!started.current) {
        started.current = true;
        onFirstEdit?.();
      }
      const current = currentDrafts();
      const value = updater(current[kind]);
      if (value === current[kind]) return;
      latest.current = { ...current, [kind]: value };
      setDrafts(latest.current);
      schedule(kind, value, delay);
    },
    // currentDrafts só lê refs; as dependências reais são estas
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onFirstEdit, schedule],
  );

  const flush = useCallback(
    (kind: ChartingSection) => {
      const timer = timers.current[kind];
      if (timer) clearTimeout(timer);
      persist(kind, currentDrafts()[kind]);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [persist],
  );

  const flushAll = useCallback(async (): Promise<boolean> => {
    for (const section of SECTIONS) {
      const timer = timers.current[section.kind];
      if (timer) clearTimeout(timer);
      persist(section.kind, currentDrafts()[section.kind]);
    }
    await Promise.all(Object.values(queues.current).map((queue) => queue?.catch(() => undefined)));
    return failedKinds.current.size === 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persist]);

  useEffect(() => {
    if (flushRef) flushRef.current = flushAll;
  }, [flushRef, flushAll]);

  /** Modelo preenche o que está vazio e acrescenta ao que já tem texto, sem apagar nada. */
  const applyTemplate = useCallback(
    (template: NoteTemplate) => {
      if (template.kind === 'snippet' && template.body) {
        const target = fields.current[activeSection];
        if (target) target.insert(template.body);
        else setSection(activeSection, (current) => (current ? `${current}\n${template.body}` : template.body ?? ''), 300);
        return;
      }
      for (const section of SECTIONS) {
        const text = template.sections[section.kind]?.trim();
        if (!text) continue;
        setSection(
          section.kind,
          (current) => {
            const existing = current.trim();
            if (!existing) return text;
            // a queixa contada na recepção é mais específica que a do modelo
            if (section.kind === 'chief_complaint' || existing.includes(text)) return current;
            return `${existing}\n${text}`;
          },
          300,
        );
      }
      toast.success(`Modelo "${template.name}" aplicado. Complete o que estiver com __.`);
    },
    [activeSection, setSection],
  );

  const dictation = useDictation((text) => {
    setSection(activeSection, (current) => (current.trim() ? `${current.trimEnd()} ${text}` : text), 600);
  });

  const completeness = useMemo(
    () =>
      recordCompleteness({
        noteKinds: [
          ...SECTIONS.map((section) => ({ kind: section.kind, body: drafts[section.kind] })),
          ...triageNotes.map((note) => ({ kind: note.kind, body: note.body })),
        ],
        observationCount,
        diagnosisCount,
      }),
    [drafts, triageNotes, observationCount, diagnosisCount],
  );

  const isEmpty = SECTIONS.every((section) => section.kind === 'chief_complaint' || !drafts[section.kind].trim());
  const complaint = [drafts.chief_complaint, ...triageNotes.map((note) => note.body)].join(' ');
  const suggested = useMemo(
    () => (isEmpty ? suggestTemplate(templates, { complaint, serviceCategory }) : undefined),
    [isEmpty, complaint, serviceCategory, templates],
  );

  const focusSection: Record<string, ChartingSection> = {
    report: 'chief_complaint',
    exam: 'physical_exam',
    diagnosis: 'assessment',
    plan: 'plan',
  };

  return (
    <div className="space-y-3">
      {triageNotes.length > 0 && (
        <div className="rounded-[var(--radius)] border border-[var(--info)]/20 bg-[var(--info-soft)] px-3 py-2.5">
          <p className="text-[11.5px] font-semibold uppercase tracking-wider text-[var(--info)]">Triagem e recepção</p>
          {triageNotes.map((note) => (
            <p key={note.id} className="mt-0.5 whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--ink)]">
              {note.body}
            </p>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="subtle" size="sm" onClick={() => setTemplatesOpen(true)}>
          <NotebookPen className="h-4 w-4" />
          Modelos
        </Button>
        <Button variant="subtle" size="sm" onClick={() => setExamOpen(true)}>
          <ClipboardCheck className="h-4 w-4" />
          Exame normal
        </Button>
        {dictation.supported && (
          <Button
            variant={dictation.listening ? 'danger' : 'subtle'}
            size="sm"
            onClick={dictation.toggle}
            aria-pressed={dictation.listening}
            aria-label={dictation.listening ? 'Parar ditado' : 'Ditar na seção selecionada'}
            title="Ditar na seção selecionada"
          >
            {dictation.listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            <span className="hidden sm:inline">{dictation.listening ? 'Parar' : 'Ditar'}</span>
          </Button>
        )}
        <span className="ml-auto flex items-center gap-1 text-[12px] text-[var(--ink-3)]" aria-live="polite">
          {saveState === 'saving' && (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              salvando
            </>
          )}
          {saveState === 'saved' && (
            <>
              <Check className="h-3.5 w-3.5 text-[var(--success)]" />
              salvo
            </>
          )}
          {saveState === 'error' && (
            <button
              type="button"
              onClick={() => failed.forEach((kind) => persist(kind, currentDrafts()[kind]))}
              className="flex items-center gap-1 font-medium text-[var(--danger)]"
            >
              <RotateCw className="h-3.5 w-3.5" />
              não salvo, tentar de novo
            </button>
          )}
        </span>
      </div>

      {dictation.listening && (
        <p className="rounded-[var(--radius)] bg-[var(--danger-soft)] px-3 py-2 text-[12.5px] text-[var(--danger)]">
          Ouvindo e escrevendo em <strong>{SECTIONS.find((s) => s.kind === activeSection)?.label}</strong>. Toque em
          outra seção para mudar o destino. O reconhecimento de fala é feito pelo navegador.
        </p>
      )}
      {dictation.error && !dictation.listening && (
        <p className="text-[12.5px] text-[var(--warning)]">{dictation.error}</p>
      )}

      {suggested && (
        <button
          type="button"
          onClick={() => applyTemplate(suggested)}
          className="flex w-full items-center justify-between gap-3 rounded-[var(--radius)] border border-dashed border-[var(--brand)]/40 bg-[var(--brand-soft)]/50 px-3 py-2.5 text-left"
        >
          <span className="text-[13.5px] text-[var(--brand-ink)]">
            Começar com o modelo <strong>{suggested.name}</strong>
          </span>
          <span className="shrink-0 text-[12.5px] font-semibold text-[var(--brand)]">Usar</span>
        </button>
      )}

      <div className="space-y-3">
        {SECTIONS.map((section) => {
          const id = `note-${section.kind}`;
          return (
            <div key={section.kind}>
              <label
                htmlFor={id}
                className={cn(
                  'mb-1 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider',
                  activeSection === section.kind ? 'text-[var(--brand)]' : 'text-[var(--ink-3)]',
                )}
              >
                {section.label}
                {failed.has(section.kind) && <span className="normal-case text-[var(--danger)]">· não salvo</span>}
              </label>
              <SmartTextarea
                id={id}
                ref={(handle) => {
                  fields.current[section.kind] = handle;
                }}
                value={drafts[section.kind]}
                onChange={(value) => setSection(section.kind, () => value)}
                onFocus={() => setActiveSection(section.kind)}
                onBlur={() => flush(section.kind)}
                placeholder={section.placeholder}
                minRows={section.rows}
                templates={templates}
                onApplyTemplate={applyTemplate}
              />
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--border)] pt-3">
        <span className="mr-1 text-[12px] text-[var(--ink-3)]">Mínimo do prontuário:</span>
        {completeness.map((item) => (
          <button
            key={item.key}
            type="button"
            title={item.hint}
            onClick={() => {
              const target = focusSection[item.key];
              if (target) fields.current[target]?.focus();
            }}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium',
              item.done ? 'bg-[var(--success-soft)] text-[var(--success)]' : 'bg-[var(--surface-2)] text-[var(--ink-3)]',
            )}
          >
            {item.done ? <Check className="h-3 w-3" /> : <CircleDashed className="h-3 w-3" />}
            {item.label}
          </button>
        ))}
      </div>

      <PhysicalExamSheet
        open={examOpen}
        onOpenChange={setExamOpen}
        speciesCode={speciesCode}
        speciesName={speciesName}
        onApply={(text) =>
          setSection('physical_exam', (current) => (current.trim() ? `${current.trimEnd()}\n${text}` : text), 200)
        }
      />

      <TemplatesSheet
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        templates={templates}
        serviceCategory={serviceCategory}
        speciesId={speciesId}
        currentSections={drafts}
        onApply={applyTemplate}
      />
    </div>
  );
}
