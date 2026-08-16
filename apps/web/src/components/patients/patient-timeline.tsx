'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  FileSignature,
  FileText,
  FlaskConical,
  PawPrint,
  Pill,
  Scissors,
  Stethoscope,
  Syringe,
  Weight,
} from 'lucide-react';
import type { TimelineItem } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { TIMELINE_KIND, labelFor } from '@/lib/labels';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/primitives';

const ICON: Record<string, typeof Activity> = {
  'patient.created': PawPrint,
  'appointment.scheduled': CalendarDays,
  'appointment.cancelled': CalendarDays,
  'encounter.started': Stethoscope,
  'encounter.finished': Stethoscope,
  'note.signed': FileSignature,
  'observation.recorded': Activity,
  'weight.recorded': Weight,
  'diagnosis.recorded': Stethoscope,
  'procedure.performed': Scissors,
  'prescription.signed': Pill,
  'exam.ordered': FlaskConical,
  'exam.resulted': FlaskConical,
  'immunization.applied': Syringe,
  'preventive.applied': Syringe,
  'allergy.added': AlertTriangle,
  'document.added': FileText,
  'patient.deceased': AlertTriangle,
};

const ACCENT: Record<string, string> = {
  'encounter.finished': 'text-[var(--success)]',
  'prescription.signed': 'text-[var(--brand)]',
  'allergy.added': 'text-[var(--danger)]',
  'patient.deceased': 'text-[var(--danger)]',
  'exam.resulted': 'text-[var(--info)]',
};

/**
 * Linha do tempo derivada das fontes de verdade: cada item aponta para a
 * tabela de origem. Não existe tabela paralela de eventos só para desenhar
 * esta tela, então o que aparece aqui é exatamente o que está registrado.
 */
export function PatientTimeline({
  patientId,
  limit = 50,
  encounterOnly,
}: {
  patientId: string;
  limit?: number;
  encounterOnly?: string;
}) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['timeline', patientId, limit, encounterOnly],
    queryFn: () =>
      api.get<{ items: TimelineItem[]; nextCursor: string | null }>(`/patients/${patientId}/timeline`, {
        limit,
        encounterId: encounterOnly,
      }),
  });

  if (error) return <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />;
  if (isLoading) return <ListSkeleton rows={4} />;

  const items = data?.items ?? [];
  if (items.length === 0) {
    return <EmptyState title="Nenhum evento registrado" description="O histórico aparece conforme o atendimento acontece." />;
  }

  return (
    <ol className="relative px-4 py-3">
      <span className="absolute bottom-4 left-[27px] top-6 w-px bg-[var(--border)]" aria-hidden />
      {items.map((item) => {
        const Icon = ICON[item.kind] ?? Activity;
        const accent = ACCENT[item.kind] ?? 'text-[var(--ink-3)]';
        const body = (
          <>
            <span
              className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] ${accent}`}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1 pb-4">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[14px] font-medium text-[var(--ink)]">
                  {item.title || labelFor(TIMELINE_KIND, item.kind)}
                </span>
                <span className="text-[12px] text-[var(--ink-3)]">{formatDateTime(item.occurredAt)}</span>
              </span>
              {item.summary && (
                <span className="mt-0.5 block whitespace-pre-wrap text-[13px] leading-snug text-[var(--ink-2)]">
                  {item.summary}
                </span>
              )}
              {item.actorName && (
                <span className="mt-0.5 block text-[12px] text-[var(--ink-3)]">{item.actorName}</span>
              )}
            </span>
          </>
        );

        return (
          <li key={`${item.sourceTable}-${item.id}`} className="flex gap-3">
            {item.encounterId ? (
              <Link href={`/atendimentos/${item.encounterId}`} className="flex flex-1 gap-3 rounded-[var(--radius)] hover:bg-[var(--surface-2)]">
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ol>
  );
}
