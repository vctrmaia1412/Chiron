'use client';

import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  FlaskConical,
  History,
  PawPrint,
  Pause,
  Pill,
  Play,
  RotateCcw,
  Scissors,
  ScrollText,
  Stethoscope,
  Syringe,
  UserCheck,
  X,
} from 'lucide-react';
import type { EncounterDetail, Patient } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatDateTime, formatWeight, relativeTime } from '@/lib/format';
import { DIAGNOSIS_KIND, DISPOSITION, ENCOUNTER_CLASS, ENCOUNTER_STATUS, labelFor, statusFor } from '@/lib/labels';
import { useSession } from '@/lib/session';
import { Badge, Card, CardHeader, ErrorState, PageHeader, Skeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { useStepUp } from '@/components/auth/step-up';
import { NoteBlock, ObservationGrid, sortNotes } from '@/components/clinical/clinical-blocks';
import { NoteEditor } from '@/components/clinical/note-editor';
import { VitalsSheet } from '@/components/clinical/vitals-sheet';
import { DiagnosisSheet } from '@/components/clinical/diagnosis-sheet';
import { ProcedureSheet } from '@/components/clinical/procedure-sheet';
import { FinishEncounterSheet } from '@/components/clinical/finish-sheet';
import { AmendNoteSheet } from '@/components/clinical/amend-sheet';
import { EncounterPrescriptions } from '@/components/clinical/encounter-prescriptions';
import { EncounterExams } from '@/components/clinical/encounter-exams';
import { EncounterImmunizations } from '@/components/clinical/encounter-immunizations';
import { PatientSummaryCard } from '@/components/clinical/patient-summary';
import { EncounterActionBar, type BarAction } from '@/components/clinical/encounter-action-bar';
import { PatientHistorySheet } from '@/components/clinical/patient-history-sheet';
import { GenerateDocumentSheet } from '@/components/documents/generate-sheet';
import { DeathSheet } from '@/components/patients/death-sheet';
import { rememberEncounter } from '@/components/clinical/active-encounter-pill';
import { NAV_ITEMS } from '@/components/layout/navigation';

type SheetKey = 'vitals' | 'diagnosis' | 'procedure' | 'finish' | 'more' | null;

const OPEN_STATUSES = ['arrived', 'triaged', 'in_progress', 'on_hold'];

/**
 * O atendimento numa tela só. Nada de abas: registro, diagnóstico, receita,
 * vacina e exame ficam um embaixo do outro, e os formulários abrem por cima
 * sem tirar o veterinário do contexto. No computador o resumo do paciente e
 * os sinais ficam na coluna da direita; no celular vêm primeiro, recolhíveis,
 * e as ações moram na barra inferior, ao alcance do polegar.
 */
export default function EncounterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { can, hasModule, context } = useSession();

  const [sheet, setSheet] = useState<SheetKey>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    rememberEncounter(id);
  }, [id]);
  const [prescriptionOpen, setPrescriptionOpen] = useState(false);
  const [vaccineOpen, setVaccineOpen] = useState(false);
  const [examOpen, setExamOpen] = useState(false);
  const [amendTarget, setAmendTarget] = useState<string | null>(null);
  const [documentOpen, setDocumentOpen] = useState(false);
  const [deathOpen, setDeathOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const flushNotes = useRef<(() => Promise<boolean>) | null>(null);
  const autoStarted = useRef(false);

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
    mutationFn: (action: 'start' | 'hold' | 'resume' | 'assume') =>
      api.post<EncounterDetail>(`/encounters/${id}/${action}`),
    onSuccess: async (_result, action) => {
      await queryClient.invalidateQueries({ queryKey: ['encounter', id] });
      await queryClient.invalidateQueries({ queryKey: ['encounters'] });
      if (action === 'assume') toast.success('Você assumiu o atendimento.');
    },
    onError: (caught) => toast.error(errorMessage(caught)),
  });

  const removeDiagnosis = useMutation({
    mutationFn: (diagnosisId: string) => api.delete(`/encounters/${id}/diagnoses/${diagnosisId}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['encounter', id] });
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
  const open = OPEN_STATUSES.includes(encounter.status);
  const writable = open && can('encounter:update');
  const canSign = can('encounter:sign');
  // Plantão: outro veterinário abriu, quem está com o paciente agora assume
  // antes de finalizar (a API recusa a assinatura de quem não é o responsável).
  const myProfessionalId = context?.membership?.professionalId ?? null;
  const attending = encounter.attendingProfessional;
  const someoneElses =
    open && canSign && Boolean(attending) && attending?.id !== myProfessionalId && !can('encounter:reassign');
  const canFinish = writable && canSign && !someoneElses;
  const notStarted = ['arrived', 'triaged'].includes(encounter.status);
  const canStart = writable && notStarted && canSign;
  const notes = sortNotes(encounter.notes);
  const activeNotes = notes.filter((note) => !note.supersededByNoteId);
  const supersededNotes = notes.filter((note) => note.supersededByNoteId);
  const triageNotes = activeNotes.filter((note) => note.kind === 'triage');
  const activeAllergies = patient?.allergies.filter((allergy) => allergy.status === 'active') ?? [];
  const activeAlerts = patient?.alerts.filter((alert) => alert.active) ?? [];
  const guardianPhone =
    patient?.guardians.find((guardian) => guardian.isPrimary)?.guardianPhone ??
    patient?.guardians[0]?.guardianPhone ??
    null;
  const weight = encounter.weightKg ?? encounter.patient.currentWeightKg;

  // Começar a escrever já é começar o atendimento: um botão a menos no
  // caminho de quem tem o paciente na mesa.
  function handleFirstEdit() {
    if (autoStarted.current || !notStarted || !can('encounter:sign')) return;
    autoStarted.current = true;
    transition.mutate('start');
  }

  // Voltar leva para onde o veterinário estava (painel, ficha, fila). Aberto
  // por link direto, sem histórico, cai na fila de atendimentos.
  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push('/atendimentos');
  }

  async function openFinish() {
    setFinishing(true);
    try {
      const allSaved = (await flushNotes.current?.()) ?? true;
      if (!allSaved) {
        toast.error('Há texto que não foi salvo. Tente salvar de novo antes de finalizar.');
        return;
      }
      await queryClient.refetchQueries({ queryKey: ['encounter', id] });
      setSheet('finish');
    } finally {
      setFinishing(false);
    }
  }

  const isVaccination = encounter.serviceCategory === 'vaccination' || encounter.serviceCategory === 'preventive';
  const barActions: BarAction[] = writable
    ? [
        { key: 'vitals', label: 'Sinais', icon: Activity, onClick: () => setSheet('vitals') },
        ...(isVaccination && hasModule('immunization')
          ? [{ key: 'vaccine', label: 'Vacina', icon: Syringe, onClick: () => setVaccineOpen(true) }]
          : [{ key: 'diagnosis', label: 'Diagnóstico', icon: Stethoscope, onClick: () => setSheet('diagnosis') }]),
        ...(hasModule('clinical') && can('prescription:create')
          ? [{ key: 'rx', label: 'Receita', icon: Pill, onClick: () => setPrescriptionOpen(true) }]
          : []),
      ]
    : [];

  const moreActions: BarAction[] = [
    ...(isVaccination
      ? [{ key: 'diagnosis', label: 'Diagnóstico', icon: Stethoscope, onClick: () => setSheet('diagnosis') }]
      : hasModule('immunization')
        ? [{ key: 'vaccine', label: 'Vacina ou vermífugo', icon: Syringe, onClick: () => setVaccineOpen(true) }]
        : []),
    ...(hasModule('lab') && can('exam_order:create')
      ? [{ key: 'exam', label: 'Pedir exame', icon: FlaskConical, onClick: () => setExamOpen(true) }]
      : []),
    { key: 'procedure', label: 'Procedimento', icon: Scissors, onClick: () => setSheet('procedure') },
    ...(encounter.status === 'in_progress'
      ? [{ key: 'hold', label: 'Pausar atendimento', icon: Pause, onClick: () => transition.mutate('hold') }]
      : encounter.status === 'on_hold'
        ? [{ key: 'resume', label: 'Retomar atendimento', icon: Play, onClick: () => transition.mutate('resume') }]
        : []),
  ];

  const primary = canFinish
    ? { label: 'Finalizar', kind: 'finish' as const, onClick: () => void openFinish(), loading: finishing }
    : writable && someoneElses
      ? { label: 'Assumir', kind: 'assume' as const, onClick: () => transition.mutate('assume'), loading: transition.isPending }
      : canStart
        ? { label: 'Iniciar', kind: 'start' as const, onClick: () => transition.mutate('start'), loading: transition.isPending }
        : undefined;

  const patientLine = [
    encounter.patient.speciesName,
    encounter.patient.breedName,
    encounter.patient.ageLabel,
    formatWeight(weight),
    encounter.guardianName,
    encounter.serviceName,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      {/* Celular: cabeçalho fixo com saída clara e consulta ao histórico. O
          título grande do computador ocuparia meia tela aqui. */}
      <div className="sticky top-[var(--header-h)] z-10 -mx-4 -mt-4 mb-3 border-b border-[var(--border)] bg-[var(--bg)]/95 px-2 py-1.5 backdrop-blur lg:hidden">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={goBack}
            aria-label="Voltar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius)] text-[var(--ink-2)] active:bg-[var(--surface-2)]"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Link href={`/pacientes/${encounter.patient.id}`} className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-[17px] font-semibold text-[var(--ink)]">{encounter.patient.name}</span>
              <Badge tone={status.tone} dot={encounter.status === 'in_progress'}>
                {status.label}
              </Badge>
            </span>
            <span className="block truncate text-[12px] text-[var(--ink-3)]">{patientLine}</span>
          </Link>
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="flex h-11 shrink-0 flex-col items-center justify-center rounded-[var(--radius)] px-2 text-[11px] font-medium text-[var(--brand)] active:bg-[var(--surface-2)]"
          >
            <History className="h-5 w-5" />
            Histórico
          </button>
        </div>
      </div>

      {encounter.status === 'finished' && can('encounter:reopen') && (
        <div className="mb-3 flex justify-end lg:hidden">
          <ReopenButton encounterId={encounter.id} />
        </div>
      )}

      <div className="hidden lg:block">
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
        description={patientLine}
        actions={
          <>
            <span className="hidden flex-wrap gap-2 lg:flex">
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
              {writable && someoneElses && (
                <Button size="sm" onClick={() => transition.mutate('assume')} loading={transition.isPending}>
                  <UserCheck className="h-4 w-4" />
                  Assumir atendimento
                </Button>
              )}
              {canStart && (
                <Button
                  size="sm"
                  variant={canFinish ? 'secondary' : 'primary'}
                  onClick={() => transition.mutate('start')}
                  loading={transition.isPending}
                >
                  <Play className="h-4 w-4" />
                  Iniciar
                </Button>
              )}
              {canFinish && (
                <Button size="sm" onClick={() => void openFinish()} loading={finishing}>
                  <CheckCircle2 className="h-4 w-4" />
                  Finalizar
                </Button>
              )}
            </span>
            {encounter.status === 'finished' && can('encounter:reopen') && <ReopenButton encounterId={encounter.id} />}
            <Button variant="ghost" size="sm" onClick={() => setHistoryOpen(true)}>
              <History className="h-4 w-4" />
              Histórico
            </Button>
            {can('document:generate') && hasModule('documents') && (
              <Button variant="ghost" size="sm" onClick={() => setDocumentOpen(true)}>
                <FileText className="h-4 w-4" />
                Documento
              </Button>
            )}
            {can('record:read_sensitive') && (
              <Button asChild variant="ghost" size="sm">
                <Link href={`/pacientes/${encounter.patient.id}/prontuario`}>
                  <ScrollText className="h-4 w-4" />
                  Prontuário
                </Link>
              </Button>
            )}
          </>
        }
      />
      </div>

      {writable && someoneElses && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[13.5px] text-[var(--ink-2)]">
          <span className="min-w-0 flex-1">
            Atendimento de <strong className="font-semibold text-[var(--ink)]">{attending?.name}</strong>. Para
            finalizar e assinar, assuma o atendimento.
          </span>
          <Button size="sm" variant="secondary" onClick={() => transition.mutate('assume')} loading={transition.isPending}>
            <UserCheck className="h-4 w-4" />
            Assumir
          </Button>
        </div>
      )}

      {(activeAllergies.length > 0 || activeAlerts.length > 0) && (
        <div className="mb-4 flex flex-wrap gap-2">
          {activeAllergies.length > 0 && (
            <p className="flex w-full items-start gap-2 rounded-[var(--radius)] border border-[var(--danger)]/25 bg-[var(--danger-soft)] px-3 py-2 text-[13.5px] text-[var(--danger)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong className="font-semibold">Alergia:</strong>{' '}
                {activeAllergies
                  .map((allergy) => `${allergy.substance}${allergy.reaction ? ` (${allergy.reaction})` : ''}`)
                  .join(' · ')}
              </span>
            </p>
          )}
          {activeAlerts.map((alert) => (
            <span
              key={alert.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--warning)]/25 bg-[var(--warning-soft)] px-3 py-1 text-[13px] font-medium text-[var(--warning)]"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {alert.message}
            </span>
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

      <div className="grid gap-4 md:gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <aside className="space-y-4 md:space-y-5 lg:sticky lg:top-[calc(var(--header-h)+16px)] lg:col-start-2 lg:row-start-1">
          <PatientSummaryCard
            patientId={encounter.patient.id}
            encounterId={encounter.id}
            canEditProblems={can('encounter:update')}
          />

          <Card>
            <CardHeader
              title="Sinais vitais"
              action={
                writable ? (
                  <Button variant="ghost" size="sm" onClick={() => setSheet('vitals')}>
                    <Activity className="h-4 w-4" />
                    Registrar
                  </Button>
                ) : undefined
              }
            />
            <div className="px-4 py-3">
              {encounter.observations.length === 0 ? (
                <p className="text-[13.5px] text-[var(--ink-3)]">Nenhum sinal vital registrado.</p>
              ) : (
                <ObservationGrid observations={encounter.observations} />
              )}
            </div>
          </Card>

          <Card className="hidden lg:block">
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
                value={
                  encounter.followUpDueAt
                    ? `${formatDate(encounter.followUpDueAt)}${encounter.followUpReason ? ` · ${encounter.followUpReason}` : ''}`
                    : null
                }
              />
            </dl>
          </Card>
        </aside>

        <div className="min-w-0 space-y-4 md:space-y-5 lg:col-start-1 lg:row-start-1">
          <Card>
            <CardHeader title="Registro clínico" />
            <div className="px-4 py-4">
              {writable ? (
                <NoteEditor
                  key={encounter.id}
                  encounterId={encounter.id}
                  notes={activeNotes}
                  triageNotes={triageNotes}
                  speciesId={patient?.species.id ?? null}
                  speciesCode={patient?.species.code ?? null}
                  speciesName={patient?.species.namePt ?? encounter.patient.speciesName}
                  serviceCategory={encounter.serviceCategory}
                  observationCount={encounter.observations.length}
                  diagnosisCount={encounter.diagnoses.length}
                  onFirstEdit={handleFirstEdit}
                  flushRef={flushNotes}
                />
              ) : (
                <div className="space-y-3">
                  {activeNotes.length === 0 ? (
                    <p className="text-[13.5px] text-[var(--ink-3)]">Nenhuma nota registrada.</p>
                  ) : (
                    activeNotes.map((note) => (
                      <div key={note.id} className="space-y-1">
                        <NoteBlock note={note} />
                        {note.status === 'final' && can('encounter:amend') && (
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
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Diagnóstico e procedimentos"
              action={
                writable ? (
                  <span className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setSheet('procedure')}>
                      <Scissors className="h-4 w-4" />
                      <span className="hidden sm:inline">Procedimento</span>
                    </Button>
                    <Button variant="subtle" size="sm" onClick={() => setSheet('diagnosis')}>
                      <Stethoscope className="h-4 w-4" />
                      Diagnóstico
                    </Button>
                  </span>
                ) : undefined
              }
            />
            <div className="space-y-2 px-4 py-3">
              {encounter.diagnoses.length === 0 && encounter.procedures.length === 0 && (
                <p className="text-[13.5px] text-[var(--ink-3)]">
                  Nenhum diagnóstico registrado. Um presuntivo já basta para o prontuário.
                </p>
              )}
              {encounter.diagnoses.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {[...encounter.diagnoses]
                    .sort((a, b) => a.rank - b.rank)
                    .map((diagnosis) => (
                      <li
                        key={diagnosis.id}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-3)] py-1 pl-3 pr-1.5 text-[13.5px] text-[var(--ink)]"
                      >
                        <span className={diagnosis.kind === 'ruled_out' ? 'line-through opacity-70' : ''}>
                          {diagnosis.description}
                        </span>
                        <span className="text-[11.5px] text-[var(--ink-3)]">
                          {labelFor(DIAGNOSIS_KIND, diagnosis.kind).toLowerCase()}
                        </span>
                        {writable && (
                          <button
                            type="button"
                            onClick={() => removeDiagnosis.mutate(diagnosis.id)}
                            aria-label={`Remover ${diagnosis.description}`}
                            className="rounded-full p-1 text-[var(--ink-3)] hover:bg-black/5 hover:text-[var(--danger)]"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </li>
                    ))}
                </ul>
              )}
              {encounter.procedures.length > 0 && (
                <ul className="divide-y divide-[var(--border)] rounded-[var(--radius)] border border-[var(--border)]">
                  {encounter.procedures.map((procedure) => (
                    <li key={procedure.id} className="px-3 py-2">
                      <p className="text-[14px] text-[var(--ink)]">{procedure.description}</p>
                      <p className="text-[12px] text-[var(--ink-3)]">
                        {formatDateTime(procedure.performedAt)}
                        {procedure.performedByName ? ` · ${procedure.performedByName}` : ''}
                        {procedure.notes ? ` · ${procedure.notes}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          {hasModule('clinical') && (
            <EncounterPrescriptions
              encounterId={encounter.id}
              patientId={encounter.patient.id}
              patientName={encounter.patient.name}
              weightKg={weight}
              writable={writable}
              speciesId={patient?.species.id ?? null}
              formOpen={prescriptionOpen}
              onFormOpenChange={setPrescriptionOpen}
            />
          )}

          {hasModule('immunization') && (
            <EncounterImmunizations
              encounterId={encounter.id}
              patientId={encounter.patient.id}
              writable={writable}
              vaccineOpen={vaccineOpen}
              onVaccineOpenChange={setVaccineOpen}
            />
          )}

          {hasModule('lab') && (
            <EncounterExams
              encounterId={encounter.id}
              patientId={encounter.patient.id}
              writable={writable}
              formOpen={examOpen}
              onFormOpenChange={setExamOpen}
            />
          )}
        </div>
      </div>

      <EncounterActionBar
        actions={barActions}
        onMore={() => setSheet('more')}
        primary={primary}
        patientId={encounter.patient.id}
      />

      <Sheet open={sheet === 'more'} onOpenChange={(next) => setSheet(next ? 'more' : null)} title="Mais" size="sm">
        <div className="space-y-4">
          {writable && moreActions.length > 0 && (
            <MenuSection title="Neste atendimento">
              {moreActions.map((action) => (
                <MenuButton
                  key={action.key}
                  icon={action.icon}
                  label={action.label}
                  onClick={() => {
                    setSheet(null);
                    action.onClick();
                  }}
                />
              ))}
            </MenuSection>
          )}

          {((can('document:generate') && hasModule('documents')) || (can('death:record') && patient?.status === 'active')) && (
            <MenuSection title="Documentos">
              {can('document:generate') && hasModule('documents') && (
                <MenuButton
                  icon={FileText}
                  label="Atestado, termo ou declaração"
                  onClick={() => {
                    setSheet(null);
                    setDocumentOpen(true);
                  }}
                />
              )}
              {can('death:record') && patient?.status === 'active' && (
                <MenuButton
                  icon={X}
                  label="Registrar óbito"
                  onClick={() => {
                    setSheet(null);
                    setDeathOpen(true);
                  }}
                />
              )}
            </MenuSection>
          )}

          <MenuSection title="Consultar">
            <MenuButton
              icon={History}
              label="Histórico: exames, consultas, vacinas e receitas"
              onClick={() => {
                setSheet(null);
                setHistoryOpen(true);
              }}
            />
            <MenuLink icon={PawPrint} label={`Ficha de ${encounter.patient.name}`} href={`/pacientes/${encounter.patient.id}`} />
            {can('record:read_sensitive') && (
              <MenuLink icon={ScrollText} label="Prontuário completo" href={`/pacientes/${encounter.patient.id}/prontuario`} />
            )}
          </MenuSection>

          <MenuSection title="Ir para">
            {NAV_ITEMS.filter((item) => hasModule(item.module) && can(item.permission)).map((item) => (
              <MenuLink key={item.href} icon={item.icon} label={item.label} href={item.href} />
            ))}
          </MenuSection>
          <p className="px-3 text-[12px] text-[var(--ink-3)]">
            O que você escreveu fica salvo. Para voltar a este atendimento, toque no aviso &quot;Em atendimento&quot; no
            rodapé de qualquer tela.
          </p>
        </div>
      </Sheet>

      <GenerateDocumentSheet open={documentOpen} onOpenChange={setDocumentOpen} encounterId={encounter.id} />
      {patient && (
        <DeathSheet
          open={deathOpen}
          onOpenChange={setDeathOpen}
          patient={patient}
          encounterId={encounter.id}
          onRecorded={() => void queryClient.invalidateQueries({ queryKey: ['encounter', id] })}
        />
      )}

      <PatientHistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        patientId={encounter.patient.id}
        patientName={encounter.patient.name}
        currentEncounterId={encounter.id}
      />

      <VitalsSheet
        open={sheet === 'vitals'}
        onOpenChange={(next) => setSheet(next ? 'vitals' : null)}
        encounterId={encounter.id}
        speciesCode={patient?.species.code ?? null}
        isTriage={encounter.status === 'arrived'}
      />

      <DiagnosisSheet
        open={sheet === 'diagnosis'}
        onOpenChange={(next) => setSheet(next ? 'diagnosis' : null)}
        encounterId={encounter.id}
        patientId={encounter.patient.id}
        speciesId={patient?.species.id ?? null}
      />

      <ProcedureSheet
        open={sheet === 'procedure'}
        onOpenChange={(next) => setSheet(next ? 'procedure' : null)}
        encounterId={encounter.id}
      />

      <FinishEncounterSheet
        open={sheet === 'finish'}
        onOpenChange={(next) => setSheet(next ? 'finish' : null)}
        encounter={encounter}
        guardianPhone={guardianPhone}
      />

      <AmendNoteSheet encounterId={encounter.id} noteId={amendTarget} onClose={() => setAmendTarget(null)} />
    </>
  );
}

function MenuSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 px-3 text-[11.5px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">{title}</h3>
      <ul className="space-y-0.5">{children}</ul>
    </section>
  );
}

const menuItemClass =
  'flex w-full items-center gap-3 rounded-[var(--radius)] px-3 py-3 text-left text-[15px] font-medium text-[var(--ink-2)] hover:bg-[var(--surface-2)] active:bg-[var(--surface-2)]';

function MenuButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <li>
      <button type="button" onClick={onClick} className={menuItemClass}>
        <Icon className="h-5 w-5 shrink-0 text-[var(--ink-3)]" />
        {label}
      </button>
    </li>
  );
}

function MenuLink({
  icon: Icon,
  label,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
}) {
  return (
    <li>
      <Link href={href} className={menuItemClass}>
        <Icon className="h-5 w-5 shrink-0 text-[var(--ink-3)]" />
        {label}
      </Link>
    </li>
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
  const stepUp = useStepUp();
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);

  // Reabrir é sensível: a API pede a senha de novo e o hook repete a ação.
  const mutation = useMutation({
    mutationFn: () => stepUp.run(() => api.post(`/encounters/${encounterId}/reopen`, { reason: reason.trim() })),
    onSuccess: async (done) => {
      if (!done) return;
      await queryClient.invalidateQueries({ queryKey: ['encounter', encounterId] });
      await queryClient.invalidateQueries({ queryKey: ['encounters'] });
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
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Reabrir atendimento"
        description="As notas assinadas permanecem. A reabertura e o motivo entram na auditoria."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} className="sm:w-auto">
              Cancelar
            </Button>
            <Button
              disabled={reason.trim().length < 5}
              loading={mutation.isPending}
              onClick={() => mutation.mutate()}
              className="sm:w-auto"
            >
              Reabrir
            </Button>
          </>
        }
      >
        <label htmlFor="reopen-reason" className="sr-only">
          Motivo da reabertura
        </label>
        <textarea
          id="reopen-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          placeholder="Motivo da reabertura"
          className="w-full rounded-[var(--radius)] border border-[var(--border-strong)] px-3 py-2 text-[15px]"
        />
      </Sheet>
      {stepUp.dialog}
    </>
  );
}
