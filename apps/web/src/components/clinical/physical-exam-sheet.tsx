'use client';

import { useMemo, useState } from 'react';
import { composePhysicalExam, examSystemsFor, type ExamFinding } from '@chiron/domain';
import { cn } from '@/lib/cn';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { MountWhenOpen } from '@/components/ui/mount-when-open';

type State = 'normal' | 'abnormal' | 'skipped';

/**
 * Exame físico em um toque. Todos os sistemas começam como normais, com o
 * texto de normalidade da espécie; o veterinário toca só no que encontrou de
 * diferente e descreve. "Tudo normal" grava sem abrir campo nenhum.
 */
function PhysicalExamSheetContent({
  open,
  onOpenChange,
  speciesCode,
  speciesName,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  speciesCode: string | null;
  speciesName: string | null;
  onApply: (text: string) => void;
}) {
  const systems = useMemo(() => examSystemsFor(speciesCode), [speciesCode]);
  const [states, setStates] = useState<Record<string, State>>({});
  const [findings, setFindings] = useState<Record<string, string>>({});

  const abnormalCount = systems.filter((system) => states[system.key] === 'abnormal').length;

  function compose(): string {
    const input: Record<string, ExamFinding> = {};
    for (const system of systems) {
      const state = states[system.key] ?? 'normal';
      if (state === 'skipped') input[system.key] = { skipped: true };
      if (state === 'abnormal') input[system.key] = { abnormal: findings[system.key] ?? '' };
    }
    return composePhysicalExam(systems, input);
  }

  function apply(text: string) {
    onApply(text);
    onOpenChange(false);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Exame físico"
      description={`Tudo começa normal${speciesName ? ` para ${speciesName.toLowerCase()}` : ''}. Toque só no que estiver alterado.`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={() => apply(composePhysicalExam(systems, {}))} className="sm:w-auto">
            Tudo normal
          </Button>
          <Button onClick={() => apply(compose())} className="sm:w-auto">
            Inserir no exame físico{abnormalCount > 0 ? ` (${abnormalCount} alterado${abnormalCount > 1 ? 's' : ''})` : ''}
          </Button>
        </>
      }
    >
      <ul className="divide-y divide-[var(--border)]">
        {systems.map((system) => {
          const state = states[system.key] ?? 'normal';
          return (
            <li key={system.key} className="py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-[var(--ink)]">{system.label}</p>
                  {state === 'normal' && <p className="truncate text-[12.5px] text-[var(--ink-3)]">{system.normal}</p>}
                  {state === 'skipped' && <p className="text-[12.5px] text-[var(--ink-3)]">Não avaliado</p>}
                </div>
                <div className="flex shrink-0 rounded-[var(--radius)] border border-[var(--border)] p-0.5" role="group">
                  {(
                    [
                      ['normal', 'Normal'],
                      ['abnormal', 'Alterado'],
                      ['skipped', 'N/A'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={state === value}
                      onClick={() => setStates((current) => ({ ...current, [system.key]: value }))}
                      className={cn(
                        'rounded-[6px] px-2.5 py-1.5 text-[12.5px] font-medium transition-colors',
                        state === value
                          ? value === 'abnormal'
                            ? 'bg-[var(--warning-soft)] text-[var(--warning)]'
                            : 'bg-[var(--brand-soft)] text-[var(--brand-ink)]'
                          : 'text-[var(--ink-3)] hover:bg-[var(--surface-2)]',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {state === 'abnormal' && (
                <input
                  autoFocus
                  value={findings[system.key] ?? ''}
                  onChange={(event) => setFindings((current) => ({ ...current, [system.key]: event.target.value }))}
                  placeholder={`O que foi encontrado em ${system.label.toLowerCase()}`}
                  aria-label={`Achado em ${system.label}`}
                  className="mt-2 h-11 w-full rounded-[var(--radius)] border border-[var(--warning)]/40 bg-[var(--surface)] px-3 text-[var(--ink)] focus:border-[var(--warning)] focus:outline-none focus:ring-2 focus:ring-[var(--warning-soft)] md:h-10"
                />
              )}
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

export function PhysicalExamSheet(props: React.ComponentProps<typeof PhysicalExamSheetContent>) {
  return (
    <MountWhenOpen open={props.open}>
      <PhysicalExamSheetContent {...props} />
    </MountWhenOpen>
  );
}
