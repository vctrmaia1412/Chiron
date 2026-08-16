'use client';

import type { Diagnosis, EncounterNote, Observation, Prescription } from '@chiron/contracts';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import { ABNORMAL_FLAG, DIAGNOSIS_KIND, NOTE_KIND, NOTE_ORDER, NOTE_STATUS, PRESCRIPTION_STATUS, ROUTE, labelFor, statusFor } from '@/lib/labels';
import { Badge } from '@/components/ui/primitives';

/** Ordena as notas pela sequência clínica e mantém as retificações juntas. */
export function sortNotes(notes: EncounterNote[]): EncounterNote[] {
  const order = new Map(NOTE_ORDER.map((kind, index) => [kind, index]));
  return [...notes].sort((a, b) => {
    const kindDiff = (order.get(a.kind as never) ?? 99) - (order.get(b.kind as never) ?? 99);
    if (kindDiff !== 0) return kindDiff;
    return new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime();
  });
}

export function NoteBlock({ note }: { note: EncounterNote }) {
  const status = statusFor(NOTE_STATUS, note.status);
  const superseded = Boolean(note.supersededByNoteId);

  return (
    <article
      className={`rounded-[var(--radius)] border px-3.5 py-3 ${
        superseded
          ? 'border-dashed border-[var(--border-strong)] bg-[var(--surface-2)]'
          : 'border-[var(--border)] bg-[var(--surface)]'
      }`}
    >
      <header className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <h4 className="text-[13px] font-semibold text-[var(--ink)]">
          {note.title ?? labelFor(NOTE_KIND, note.kind)}
        </h4>
        <Badge tone={superseded ? 'muted' : status.tone}>{superseded ? 'Substituída' : status.label}</Badge>
        {note.version > 1 && <span className="text-[11.5px] text-[var(--ink-3)]">versão {note.version}</span>}
      </header>

      <p
        className={`whitespace-pre-wrap text-[14px] leading-relaxed ${
          superseded ? 'text-[var(--ink-3)] line-through decoration-[var(--border-strong)]' : 'text-[var(--ink)]'
        }`}
      >
        {note.body}
      </p>

      <footer className="mt-2 text-[11.5px] text-[var(--ink-3)]">
        {note.author?.name ?? 'Autor não identificado'}
        {note.signedAt ? ` · assinada em ${formatDateTime(note.signedAt)}` : ` · rascunho de ${formatDateTime(note.createdAt)}`}
      </footer>
    </article>
  );
}

export function ObservationGrid({ observations }: { observations: Observation[] }) {
  if (observations.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {observations.map((observation) => {
        const flag = observation.abnormalFlag ? statusFor(ABNORMAL_FLAG, observation.abnormalFlag) : null;
        const informational = observation.abnormalFlagStatus === 'informational';
        const value =
          observation.valueNumeric !== null
            ? formatNumber(observation.valueNumeric, 2)
            : (observation.valueText ?? observation.valueCode ?? '');

        return (
          <div
            key={observation.id}
            className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
          >
            <p className="truncate text-[11.5px] text-[var(--ink-3)]">{observation.codeName}</p>
            <p className="mt-0.5 flex items-baseline gap-1">
              <span className="text-[17px] font-semibold tabular text-[var(--ink)]">{value}</span>
              {observation.uom && <span className="text-[12px] text-[var(--ink-3)]">{observation.uom}</span>}
            </p>
            {flag && flag.label !== 'Normal' && (
              <p
                className={`mt-1 text-[11px] font-medium ${
                  informational ? 'text-[var(--ink-3)]' : `text-[var(--${flag.tone === 'danger' ? 'danger' : 'warning'})]`
                }`}
                title={
                  informational
                    ? 'Faixa de referência ainda não validada pela clínica: indicação informativa.'
                    : undefined
                }
              >
                {flag.label}
                {observation.referenceMin && observation.referenceMax
                  ? ` · ref ${formatNumber(observation.referenceMin, 1)}–${formatNumber(observation.referenceMax, 1)}`
                  : ''}
                {informational ? ' (não validada)' : ''}
              </p>
            )}
            {observation.enteredUom && observation.enteredUom !== observation.uom && (
              <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">
                digitado: {observation.enteredValue} {observation.enteredUom}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function DiagnosisList({ diagnoses }: { diagnoses: Diagnosis[] }) {
  if (diagnoses.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {[...diagnoses]
        .sort((a, b) => a.rank - b.rank)
        .map((diagnosis) => (
          <li key={diagnosis.id} className="flex flex-wrap items-baseline gap-2">
            <span className="text-[14px] text-[var(--ink)]">{diagnosis.description}</span>
            <Badge tone={diagnosis.kind === 'final' ? 'brand' : diagnosis.kind === 'ruled_out' ? 'muted' : 'neutral'}>
              {labelFor(DIAGNOSIS_KIND, diagnosis.kind)}
            </Badge>
          </li>
        ))}
    </ul>
  );
}

export function PrescriptionBlock({ prescription }: { prescription: Prescription }) {
  const status = statusFor(PRESCRIPTION_STATUS, prescription.status);

  return (
    <article className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3">
      <header className="mb-2 flex flex-wrap items-center gap-2">
        <h4 className="text-[13px] font-semibold text-[var(--ink)]">
          Receita nº {prescription.number}
          {prescription.kind === 'controlled' ? ' (controle especial)' : ''}
        </h4>
        <Badge tone={status.tone}>{status.label}</Badge>
        {prescription.validUntil && (
          <span className="text-[11.5px] text-[var(--ink-3)]">válida até {formatDate(prescription.validUntil)}</span>
        )}
      </header>

      <ol className="space-y-2">
        {prescription.items.map((item, index) => (
          <li key={item.id} className="text-[13.5px] leading-snug">
            <p className="font-medium text-[var(--ink)]">
              {index + 1}. {item.drugName}
              {item.concentration ? ` ${item.concentration}` : ''}
            </p>
            <p className="text-[var(--ink-2)]">
              {[
                item.computedDoseValue ? `${formatNumber(item.computedDoseValue, 3)} ${item.doseUom ?? ''}` : null,
                item.dosePerKg && item.doseValue ? `(${formatNumber(item.doseValue, 3)} ${item.doseUom}/kg)` : null,
                item.route ? labelFor(ROUTE, item.route) : null,
                item.frequencyValue ? `a cada ${formatNumber(item.frequencyValue, 0)} h` : null,
                item.durationDays ? `por ${item.durationDays} dias` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {item.instructions && <p className="text-[12.5px] text-[var(--ink-3)]">{item.instructions}</p>}
            {(item.withdrawalMeatDays || item.withdrawalMilkDays) && (
              <p className="mt-0.5 text-[12.5px] font-medium text-[var(--warning)]">
                Carência:
                {item.withdrawalMeatDays ? ` carne ${item.withdrawalMeatDays} dias` : ''}
                {item.withdrawalMilkDays ? ` leite ${item.withdrawalMilkDays} dias` : ''}
              </p>
            )}
          </li>
        ))}
      </ol>

      {prescription.notes && (
        <p className="mt-2 border-t border-[var(--border)] pt-2 text-[13px] text-[var(--ink-2)]">{prescription.notes}</p>
      )}

      <footer className="mt-2 text-[11.5px] text-[var(--ink-3)]">
        {prescription.prescriber?.name ?? 'Prescritor não identificado'}
        {prescription.prescriber?.council ? ` · CRMV ${prescription.prescriber.council}` : ''}
        {prescription.signedAt ? ` · assinada em ${formatDateTime(prescription.signedAt)}` : ''}
      </footer>
    </article>
  );
}
