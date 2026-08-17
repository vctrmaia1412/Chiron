'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, EyeOff, FileText, Printer } from 'lucide-react';
import type { MedicalRecord, Patient } from '@chiron/contracts';
import { api, errorMessage, openSignedUrl } from '@/lib/api';
import { formatDate, formatDateTime, formatWeight } from '@/lib/format';
import { DISPOSITION, ENCOUNTER_CLASS, ENCOUNTER_STATUS, labelFor, statusFor } from '@/lib/labels';
import { useSession } from '@/lib/session';
import { Badge, Card, CardHeader, EmptyState, ErrorState, PageHeader, SectionTitle, Skeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';
import { DiagnosisList, NoteBlock, ObservationGrid, PrescriptionBlock, sortNotes } from '@/components/clinical/clinical-blocks';
import { PatientTimeline } from '@/components/patients/patient-timeline';

export default function MedicalRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useSession();
  const [tab, setTab] = useState<'atendimentos' | 'linha'>('atendimentos');
  const [generating, setGenerating] = useState(false);

  const { data: patient } = useQuery({
    queryKey: ['patient', id],
    queryFn: () => api.get<Patient>(`/patients/${id}`),
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['medical-record', id],
    queryFn: () => api.get<MedicalRecord>(`/patients/${id}/record`),
  });

  async function exportPdf() {
    setGenerating(true);
    try {
      await openSignedUrl(async () => {
        const generated = await api.post<{ documentId: string; title: string }>('/documents/generate', {
          templateKey: 'medical_record',
          targetType: 'patient',
          targetId: id,
          fields: {},
        });
        const download = await api.get<{ url: string }>(`/documents/${generated.documentId}/download`);
        return download.url;
      });
      toast.success('Prontuário gerado e arquivado nos documentos do paciente.');
    } catch (caught) {
      toast.error(errorMessage(caught));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      <PageHeader
        breadcrumb={
          <span className="flex items-center gap-1.5">
            <Link href="/pacientes" className="hover:text-[var(--brand)]">
              Pacientes
            </Link>
            <span>/</span>
            <Link href={`/pacientes/${id}`} className="hover:text-[var(--brand)]">
              {patient?.name ?? 'Paciente'}
            </Link>
          </span>
        }
        title="Prontuário"
        description={
          patient
            ? [patient.species.namePt, patient.breed?.name, patient.ageLabel, formatWeight(patient.currentWeightKg)]
                .filter(Boolean)
                .join(' · ')
            : undefined
        }
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => window.print()} className="no-print">
              <Printer className="h-4 w-4" />
              Imprimir
            </Button>
            {can('document:generate') && (
              <Button size="sm" onClick={() => void exportPdf()} loading={generating} className="no-print">
                <Download className="h-4 w-4" />
                Exportar PDF
              </Button>
            )}
          </>
        }
      />

      {data?.redacted && (
        <div className="mb-4 flex items-start gap-2 rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-2.5 text-[13px] text-[var(--ink-2)]">
          <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-3)]" />
          <span>
            Você está vendo uma versão reduzida do prontuário. Seções sensíveis exigem a permissão de leitura ampliada.
          </span>
        </div>
      )}

      <Tabs
        className="mb-4 no-print"
        value={tab}
        onChange={(key) => setTab(key as typeof tab)}
        items={[
          { key: 'atendimentos', label: 'Atendimentos', count: data?.encounters.length },
          { key: 'linha', label: 'Linha do tempo' },
        ]}
      />

      {error ? (
        <Card>
          <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
        </Card>
      ) : isLoading || !data ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : tab === 'linha' ? (
        <Card>
          <PatientTimeline patientId={id} limit={200} />
        </Card>
      ) : data.encounters.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileText className="h-7 w-7" />}
            title="Nenhum atendimento registrado"
            description="O prontuário é montado a partir dos atendimentos realizados."
          />
        </Card>
      ) : (
        <div className="space-y-4 md:space-y-5">
          {data.encounters.map((entry) => {
            const status = statusFor(ENCOUNTER_STATUS, entry.encounter.status);
            const notes = sortNotes(entry.notes);
            const activeNotes = notes.filter((note) => !note.supersededByNoteId);
            const supersededNotes = notes.filter((note) => note.supersededByNoteId);

            return (
              <Card key={entry.encounter.id} className="break-inside-avoid">
                <CardHeader
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      {formatDate(entry.encounter.startedAt ?? entry.encounter.arrivedAt ?? entry.encounter.createdAt)}
                      <span className="text-[13px] font-normal text-[var(--ink-3)]">
                        {entry.encounter.serviceName ?? labelFor(ENCOUNTER_CLASS, entry.encounter.class)}
                      </span>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </span>
                  }
                  description={[
                    entry.encounter.attendingProfessional?.name,
                    `Atendimento nº ${entry.encounter.number}`,
                    entry.encounter.disposition ? labelFor(DISPOSITION, entry.encounter.disposition) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  action={
                    <Link
                      href={`/atendimentos/${entry.encounter.id}`}
                      className="text-[13px] font-medium text-[var(--brand)] no-print"
                    >
                      Abrir
                    </Link>
                  }
                />

                <div className="space-y-4 px-4 py-4">
                  {entry.encounter.chiefComplaint && (
                    <div>
                      <SectionTitle>Queixa</SectionTitle>
                      <p className="mt-1 text-[14px] text-[var(--ink)]">{entry.encounter.chiefComplaint}</p>
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
                        <Link href={`/exames?pacienteId=${id}`} className="font-medium text-[var(--brand)] no-print">
                          Ver resultados
                        </Link>
                      </p>
                    </div>
                  )}

                  {entry.encounter.endedAt && (
                    <p className="border-t border-[var(--border)] pt-2 text-[11.5px] text-[var(--ink-3)]">
                      Finalizado em {formatDateTime(entry.encounter.endedAt)}
                    </p>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
