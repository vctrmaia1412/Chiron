'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
  Pause,
  Pill,
  Play,
  RotateCcw,
  ScrollText,
  Syringe,
} from 'lucide-react';
import type { EncounterDetail, Patient } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, formatWeight, relativeTime } from '@/lib/format';
import { DISPOSITION, ENCOUNTER_CLASS, ENCOUNTER_STATUS, labelFor, statusFor } from '@/lib/labels';
import { useSession } from '@/lib/session';
import { Badge, Card, CardHeader, ErrorState, PageHeader, SectionTitle, Skeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';
import { DiagnosisList, NoteBlock, ObservationGrid, sortNotes } from '@/components/clinical/clinical-blocks';
import { NoteEditor } from '@/components/clinical/note-editor';
import { VitalsSheet } from '@/components/clinical/vitals-sheet';
import { DiagnosisSheet } from '@/components/clinical/diagnosis-sheet';
import { FinishEncounterSheet } from '@/components/clinical/finish-sheet';
import { AmendNoteSheet } from '@/components/clinical/amend-sheet';
import { EncounterPrescriptions } from '@/components/clinical/encounter-prescriptions';
import { EncounterExams } from '@/components/clinical/encounter-exams';
import { EncounterImmunizations } from '@/components/clinical/encounter-immunizations';

type Tab = 'registro' | 'receitas' | 'exames' | 'vacinas';

export default function EncounterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const { can, hasModule } = useSession();

  const [tab, setTab] = useState<Tab>('registro');
  const [vitalsOpen, setVitalsOpen] = useState(false);
  const [diagnosisOpen, setDiagnosisOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [amendTarget, setAmendTarget] = useState<string | null>(null);

  const { data: encounter, isLoading, error, refetch } = useQuery({
    queryKey: ['encounter', id],
    queryFn: () => api.get<EncounterDetail>(`/encounters/${id}`),
  });

  const { data: patient } = useQuery({
    queryKey: ['patient', encounter?.patient.id],
    queryFn: () => api.get<Patient>(`/patients/${encounter!.patient.id}`),
    enabled: Boolean(encounter?.patient.id),
  });

  const transition = useMutation({
    mutationFn: (action: 'start' | 'hold' | 'resume') => api.post<EncounterDetail>(`/encounters/${id}/${action}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['encounter', id] });
      await queryClient.invalidateQueries({ queryKey: ['encounters'] });
    },
    onError: (caught) => toast.error(errorMessage(caught)),
  });

  if (error) {
    return (
      <Card>
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      </Card>
    );
  }

  if (isLoading || !encounter) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const status = statusFor(ENCOUNTER_STATUS, encounter.status);
  const open = ['arrived', 'triaged', 'in_progress', 'on_hold'].includes(encounter.status);
  const writable = open && can('encounter:update');
  const notes = sortNotes(encounter.notes);
  const activeNotes = notes.filter((note) => !note.supersededByNoteId);
  const supersededNotes = notes.filter((note) => note.supersededByNoteId);
  const activeAllergies = patient?.allergies.filter((allergy) => allergy.status === 'active') ?? [];
  const activeAlerts = patient?.alerts.filter((alert) => alert.active) ?? [];

  return (
    <>
      <PageHeader
        breadcrumb={
          <span className="flex items-center gap-1.5">
            <Link href="/atendimentos" className="hover:text-[var(--brand)]">
              Atendimentos
            </Link>
            <span>/</span>
            <span className="tabular">nº {encounter.number}</span>
          </span>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={`/pacientes/${encounter.patient.id}`} className="hover:text-[var(--brand)]">
              {encounter.patient.name}
            </Link>
            <Badge tone={status.tone} dot={encounter.status === 'in_progress'}>
              {status.label}
            </Badge>
          </span>
        }
        description={[
          encounter.patient.speciesName,
          encounter.patient.breedName,
          encounter.patient.ageLabel,
          formatWeight(encounter.weightKg ?? encounter.patient.currentWeightKg),
          encounter.guardianName,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            {writable && encounter.status === 'in_progress' && (
              <Button variant="secondary" size="sm" onClick={() => transition.mutate('hold')}>
                <Pause className="h-4 w-4" />
                Pausar
              </Button>
            )}
            {writable && encounter.status === 'on_hold' && (
              <Button variant="secondary" size="sm" onClick={() => transition.mutate('resume')}>
                <Play className="h-4 w-4" />
                Retomar
              </Button>
            )}
            {writable && ['arrived', 'triaged'].includes(encounter.status) && (
              <Button size="sm" onClick={() => transition.mutate('start')} loading={transition.isPending}>
                <Play className="h-4 w-4" />
                Iniciar atendimento
              </Button>
            )}
            {writable && ['in_progress', 'on_hold'].includes(encounter.status) && can('encounter:finish') && (
              <Button size="sm" onClick={() => setFinishOpen(true)}>
                <CheckCircle2 className="h-4 w-4" />
                Finalizar
              </Button>
            )}
            {encounter.status === 'finished' && can('encounter:reopen') && (
              <ReopenButton encounterId={encounter.id} />
            )}
            <Button asChild variant="ghost" size="sm">
              <Link href={`/pacientes/${encounter.patient.id}/prontuario`}>
                <ScrollText className="h-4 w-4" />
                Prontuário
              </Link>
            </Button>
          </>
        }
      />

      {(activeAllergies.length > 0 || activeAlerts.length > 0) && (
        <div className="mb-4 space-y-2">
          {activeAllergies.map((allergy) => (
            <div
              key={allergy.id}
              className="flex items-start gap-2 rounded-[var(--radius)] border border-[var(--danger)]/25 bg-[var(--danger-soft)] px-3 py-2.5 text-[13.5px] text-[var(--danger)]"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong className="font-semibold">Alergia: {allergy.substance}</strong>
                {allergy.reaction ? ` — ${allergy.reaction}` : ''}
              </span>
            </div>
          ))}
          {activeAlerts.map((alert) => (
            <div
              key={alert.id}
              className="flex items-start gap-2 rounded-[var(--radius)] border border-[var(--warning)]/25 bg-[var(--warning-soft)] px-3 py-2.5 text-[13.5px] text-[var(--warning)]"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{alert.message}</span>
            </div>
          ))}
        </div>
      )}

      {encounter.status === 'finished' && (
        <div className="mb-4 rounded-[var(--radius)] border border-[var(--success)]/25 bg-[var(--success-soft)] px-3 py-2.5 text-[13px] text-[var(--success)]">
          Finalizado
          {encounter.endedAt ? ` em ${formatDateTime(encounter.endedAt)}` : ''}
          {encounter.finishedByName ? ` por ${encounter.finishedByName}` : ''}
          {encounter.disposition ? ` · ${labelFor(DISPOSITION, encounter.disposition)}` : ''}
          {encounter.integrityHash ? ' · registro selado' : ''}
        </div>
      )}

      {encounter.reopenedAt && (
        <div className="mb-4 rounded-[var(--radius)] border border-[var(--warning)]/25 bg-[var(--warning-soft)] px-3 py-2.5 text-[13px] text-[var(--warning)]">
          Reaberto em {formatDateTime(encounter.reopenedAt)}
          {encounter.reopenReason ? `: ${encounter.reopenReason}` : ''}
        </div>
      )}

      <Tabs
        className="mb-4"
        value={tab}
        onChange={(key) => setTab(key as Tab)}
        items={[
          { key: 'registro', label: 'Registro clínico' },
          { key: 'receitas', label: 'Receitas', disabled: !hasModule('clinical') },
          { key: 'exames', label: 'Exames', disabled: !hasModule('lab') },
          { key: 'vacinas', label: 'Vacinas', disabled: !hasModule('immunization') },
        ]}
      />

      {tab === 'registro' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px] md:gap-5">
          <div className="space-y-4 md:space-y-5">
            <Card>
              <CardHeader
                title="Sinais vitais"
                action={
                  writable ? (
                    <Button variant="ghost" size="sm" onClick={() => setVitalsOpen(true)}>
                      <Activity className="h-4 w-4" />
                      Registrar
                    </Button>
                  ) : undefined
                }
              />
              <div className="px-4 py-3">
                {encounter.observations.length === 0 ? (
                  <p className="text-[13.5px] text-[var(--ink-3)]">
                    Nenhum sinal vital registrado neste atendimento.
                  </p>
                ) : (
                  <ObservationGrid observations={encounter.observations} />
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title="Registro clínico" />
              <div className="space-y-3 px-4 py-4">
                {writable ? (
                  <NoteEditor encounterId={encounter.id} notes={activeNotes} />
                ) : activeNotes.length === 0 ? (
                  <p className="text-[13.5px] text-[var(--ink-3)]">Nenhuma nota registrada.</p>
                ) : (
                  activeNotes.map((note) => (
                    <div key={note.id} className="space-y-1">
                      <NoteBlock note={note} />
                      {note.status === 'final' && can('note:amend') && (
                        <button
                          type="button"
                          onClick={() => setAmendTarget(note.id)}
                          className="text-[12.5px] font-medium text-[var(--brand)]"
                        >
                          Adicionar adendo
                        </button>
                      )}
                    </div>
                  ))
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
              </div>
            </Card>
          </div>

          <div className="space-y-4 md:space-y-5">
            <Card>
              <CardHeader
                title="Diagnósticos"
                action={
                  writable ? (
                    <Button variant="ghost" size="sm" onClick={() => setDiagnosisOpen(true)}>
                      Adicionar
                    </Button>
                  ) : undefined
                }
              />
              <div className="px-4 py-3">
                {encounter.diagnoses.length === 0 ? (
                  <p className="text-[13.5px] text-[var(--ink-3)]">Nenhum diagnóstico registrado.</p>
                ) : (
                  <DiagnosisList diagnoses={encounter.diagnoses} />
                )}
              </div>
            </Card>

            {encounter.procedures.length > 0 && (
              <Card>
                <CardHeader title="Procedimentos" />
                <ul className="divide-y divide-[var(--border)]">
                  {encounter.procedures.map((procedure) => (
                    <li key={procedure.id} className="px-4 py-2.5">
                      <p className="text-[14px] text-[var(--ink)]">{procedure.description}</p>
                      <p className="text-[12px] text-[var(--ink-3)]">
                        {formatDateTime(procedure.performedAt)}
                        {procedure.performedByName ? ` · ${procedure.performedByName}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <Card>
              <CardHeader title="Atendimento" />
              <dl className="px-4 py-2 text-[13px]">
                <Row label="Tipo" value={labelFor(ENCOUNTER_CLASS, encounter.class)} />
                <Row label="Serviço" value={encounter.serviceName} />
                <Row label="Profissional" value={encounter.attendingProfessional?.name} />
                <Row label="Chegada" value={encounter.arrivedAt ? formatDateTime(encounter.arrivedAt) : null} />
                <Row label="Início" value={encounter.startedAt ? formatDateTime(encounter.startedAt) : null} />
                <Row
                  label="Duração"
                  value={encounter.startedAt && !encounter.endedAt ? relativeTime(encounter.startedAt) : null}
                />
                <Row
                  label="Retorno"
                  value={encounter.followUpDueAt ? `${encounter.followUpDueAt} · ${encounter.followUpReason ?? ''}` : null}
                />
              </dl>
            </Card>
          </div>
        </div>
      )}

      {tab === 'receitas' && (
        <EncounterPrescriptions
          encounterId={encounter.id}
          patientId={encounter.patient.id}
          patientName={encounter.patient.name}
          weightKg={encounter.weightKg ?? encounter.patient.currentWeightKg}
          writable={writable}
        />
      )}

      {tab === 'exames' && (
        <EncounterExams encounterId={encounter.id} patientId={encounter.patient.id} writable={writable} />
      )}

      {tab === 'vacinas' && (
        <EncounterImmunizations
          encounterId={encounter.id}
          patientId={encounter.patient.id}
          writable={writable}
        />
      )}

      <VitalsSheet
        open={vitalsOpen}
        onOpenChange={setVitalsOpen}
        encounterId={encounter.id}
        speciesCode={patient?.species.code ?? null}
        isTriage={encounter.status === 'arrived'}
      />

      <DiagnosisSheet open={diagnosisOpen} onOpenChange={setDiagnosisOpen} encounterId={encounter.id} />

      <FinishEncounterSheet open={finishOpen} onOpenChange={setFinishOpen} encounter={encounter} />

      <AmendNoteSheet
        encounterId={encounter.id}
        noteId={amendTarget}
        onClose={() => setAmendTarget(null)}
      />
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-[var(--ink-3)]">{label}</dt>
      <dd className="min-w-0 text-right font-medium text-[var(--ink)]">{value}</dd>
    </div>
  );
}

function ReopenButton({ encounterId }: { encounterId: string }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: () => api.post(`/encounters/${encounterId}/reopen`, { reason }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['encounter', encounterId] });
      toast.success('Atendimento reaberto. A reabertura fica registrada.');
      setOpen(false);
      setReason('');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <RotateCcw className="h-4 w-4" />
        Reabrir
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(16,32,31,0.42)] p-4 sm:items-center">
          <div className="w-full max-w-md rounded-[var(--radius-lg)] bg-[var(--surface)] p-4 shadow-[var(--shadow-lg)]">
            <h3 className="text-[16px] font-semibold text-[var(--ink)]">Reabrir atendimento</h3>
            <p className="mt-1 text-[13px] text-[var(--ink-3)]">
              As notas assinadas permanecem. A reabertura e o motivo entram na auditoria.
            </p>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              placeholder="Motivo da reabertura"
              className="mt-3 w-full rounded-[var(--radius)] border border-[var(--border-strong)] px-3 py-2 text-[14px]"
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                disabled={reason.trim().length < 5}
                loading={mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                Reabrir
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
