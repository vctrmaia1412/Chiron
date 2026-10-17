'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import type { MedicalRecord } from '@chiron/contracts';
import { formatDate, formatDateTime } from '@/lib/format';
import { DISPOSITION, ENCOUNTER_CLASS, ENCOUNTER_STATUS, labelFor, statusFor } from '@/lib/labels';
import { cn } from '@/lib/cn';
import { Badge, SectionTitle } from '@/components/ui/primitives';
import { DiagnosisList, NoteBlock, ObservationGrid, PrescriptionBlock, sortNotes } from './clinical-blocks';

type Entry = MedicalRecord['encounters'][number];

/**
 * Uma consulta do prontuário, recolhida numa linha que já diz o essencial:
 * data, serviço, diagnóstico e quem atendeu. Aberta, mostra o registro
 * completo. Na impressão sai sempre aberta.
 */
export function RecordEncounterEntry({
  entry,
  patientId,
  defaultOpen = false,
  showOpenLink = true,
}: {
  entry: Entry;
  patientId: string;
  defaultOpen?: boolean;
  showOpenLink?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const encounter = entry.encounter;
  const status = statusFor(ENCOUNTER_STATUS, encounter.status);
  const notes = sortNotes(entry.notes);
  const activeNotes = notes.filter((note) => !note.supersededByNoteId);
  const supersededNotes = notes.filter((note) => note.supersededByNoteId);
  const when = encounter.startedAt ?? encounter.arrivedAt ?? encounter.createdAt;
  const summary =
    encounter.primaryDiagnosisSummary || entry.diagnoses.map((diagnosis) => diagnosis.description).join('; ') || null;

  return (
    <article className="break-inside-avoid rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold text-[var(--ink)]">{formatDate(when)}</span>
            <span className="text-[13px] text-[var(--ink-3)]">
              {encounter.serviceName ?? labelFor(ENCOUNTER_CLASS, encounter.class)}
            </span>
            {encounter.status !== 'finished' && <Badge tone={status.tone}>{status.label}</Badge>}
          </span>
          {summary && <span className="mt-0.5 block text-[14px] text-[var(--ink)]">{summary}</span>}
          {!summary && encounter.chiefComplaint && (
            <span className="mt-0.5 block truncate text-[13.5px] text-[var(--ink-2)]">{encounter.chiefComplaint}</span>
          )}
          <span className="block text-[12px] text-[var(--ink-3)]">
            {[
              encounter.attendingProfessional?.name,
              encounter.disposition ? labelFor(DISPOSITION, encounter.disposition) : null,
              entry.prescriptions.length ? `${entry.prescriptions.length} receita(s)` : null,
              entry.examOrderIds.length ? `${entry.examOrderIds.length} pedido(s) de exame` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        <ChevronDown
          className={cn('mt-1 h-4 w-4 shrink-0 text-[var(--ink-3)] transition-transform no-print', open && 'rotate-180')}
        />
      </button>

      <div className={cn('space-y-4 border-t border-[var(--border)] px-4 py-4 print:block', open ? 'block' : 'hidden')}>
        {encounter.chiefComplaint && (
          <div>
            <SectionTitle>Queixa</SectionTitle>
            <p className="mt-1 text-[14px] text-[var(--ink)]">{encounter.chiefComplaint}</p>
          </div>
        )}

        {entry.observations.length > 0 && (
          <div>
            <SectionTitle>Sinais vitais</SectionTitle>
            <div className="mt-2">
              <ObservationGrid observations={entry.observations} />
            </div>
          </div>
        )}

        {activeNotes.length > 0 && (
          <div className="space-y-2">
            <SectionTitle>Registro clínico</SectionTitle>
            {activeNotes.map((note) => (
              <NoteBlock key={note.id} note={note} />
            ))}
          </div>
        )}

        {supersededNotes.length > 0 && (
          <details className="rounded-[var(--radius)] border border-dashed border-[var(--border-strong)] px-3 py-2">
            <summary className="cursor-pointer text-[13px] font-medium text-[var(--ink-3)]">
              Versões anteriores ({supersededNotes.length})
            </summary>
            <div className="mt-2 space-y-2">
              {supersededNotes.map((note) => (
                <NoteBlock key={note.id} note={note} />
              ))}
            </div>
          </details>
        )}

        {entry.diagnoses.length > 0 && (
          <div>
            <SectionTitle>Diagnósticos</SectionTitle>
            <div className="mt-1.5">
              <DiagnosisList diagnoses={entry.diagnoses} />
            </div>
          </div>
        )}

        {entry.prescriptions.length > 0 && (
          <div className="space-y-2">
            <SectionTitle>Receitas</SectionTitle>
            {entry.prescriptions.map((prescription) => (
              <PrescriptionBlock key={prescription.id} prescription={prescription} />
            ))}
          </div>
        )}

        {entry.examOrderIds.length > 0 && (
          <div>
            <SectionTitle>Exames</SectionTitle>
            <p className="mt-1 text-[13.5px] text-[var(--ink-2)]">
              {entry.examOrderIds.length === 1
                ? '1 pedido de exame vinculado.'
                : `${entry.examOrderIds.length} pedidos de exame vinculados.`}{' '}
              <Link href={`/exames?pacienteId=${patientId}`} className="font-medium text-[var(--brand)] no-print">
                Ver resultados
              </Link>
            </p>
          </div>
        )}

        <p className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-2 text-[11.5px] text-[var(--ink-3)]">
          <span>
            Atendimento nº {encounter.number}
            {encounter.endedAt
              ? ` · ${encounter.status === 'cancelled' ? 'cancelado' : 'finalizado'} em ${formatDateTime(encounter.endedAt)}`
              : ''}
          </span>
          {showOpenLink && (
            <Link href={`/atendimentos/${encounter.id}`} className="text-[12.5px] font-medium text-[var(--brand)] no-print">
              Abrir atendimento
            </Link>
          )}
        </p>
      </div>
    </article>
  );
}
