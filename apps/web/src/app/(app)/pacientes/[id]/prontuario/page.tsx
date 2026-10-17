'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, EyeOff, FileText, Printer } from 'lucide-react';
import type { MedicalRecord, Patient } from '@chiron/contracts';
import { api, errorMessage, openSignedUrl } from '@/lib/api';
import { formatWeight } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Card, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';
import { RecordEncounterEntry } from '@/components/clinical/record-entry';
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
        back={{ href: `/pacientes/${id}`, label: patient?.name ?? 'Paciente' }}
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
        <div className="space-y-3">
          {data.encounters.map((entry, index) => (
            <RecordEncounterEntry
              key={entry.encounter.id}
              entry={entry}
              patientId={id}
              defaultOpen={index === 0}
            />
          ))}
        </div>
      )}
    </>
  );
}
