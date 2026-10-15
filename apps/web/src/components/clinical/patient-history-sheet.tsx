'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { ExamOrder, Immunization, MedicalRecord, Prescription, PreventiveTreatment } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatDateShort } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Badge, ErrorState, ListSkeleton } from '@/components/ui/primitives';
import { Sheet } from '@/components/ui/sheet';
import { Tabs } from '@/components/ui/tabs';
import { MountWhenOpen } from '@/components/ui/mount-when-open';
import { ExamOrderRow } from '@/components/lab/exam-order-row';
import { PrescriptionBlock } from './clinical-blocks';
import { RecordEncounterEntry } from './record-entry';

type Tab = 'exames' | 'consultas' | 'vacinas' | 'receitas';

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-[13.5px] text-[var(--ink-3)]">{children}</p>;
}

/**
 * Consulta rápida ao histórico sem sair do atendimento: exames com
 * resultado, consultas anteriores, vacinas e receitas. Abre por cima da
 * consulta em andamento, então o que está sendo escrito continua ali.
 */
function PatientHistorySheetContent({
  open,
  onOpenChange,
  patientId,
  patientName,
  currentEncounterId,
  initialTab = 'exames',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  patientName: string;
  currentEncounterId?: string;
  initialTab?: Tab;
}) {
  const { can, hasModule } = useSession();
  const [tab, setTab] = useState<Tab>(initialTab);

  const exams = useQuery({
    queryKey: ['exam-orders', 'patient', patientId],
    queryFn: () => api.get<{ items: ExamOrder[] }>('/exam-orders', { patientId, limit: 40 }),
    enabled: tab === 'exames' && hasModule('lab'),
  });
  const record = useQuery({
    queryKey: ['medical-record', patientId],
    queryFn: () => api.get<MedicalRecord>(`/patients/${patientId}/record`),
    enabled: tab === 'consultas' && can('record:read_sensitive'),
  });
  const vaccines = useQuery({
    queryKey: ['immunizations', 'patient', patientId],
    queryFn: () =>
      api.get<{ immunizations: Immunization[]; preventives: PreventiveTreatment[] }>('/immunizations', {
        patientId,
        limit: 60,
      }),
    enabled: tab === 'vacinas' && hasModule('immunization'),
  });
  const prescriptions = useQuery({
    queryKey: ['prescriptions', 'patient', patientId, 'history'],
    queryFn: () => api.get<{ items: Prescription[] }>('/prescriptions', { patientId, limit: 30 }),
    enabled: tab === 'receitas',
  });

  const previous = (record.data?.encounters ?? []).filter((entry) => entry.encounter.id !== currentEncounterId);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Histórico de ${patientName}`}
      description="Consulte sem sair: o que você está escrevendo continua no atendimento."
      size="lg"
    >
      <Tabs
        className="-mx-4 mb-3 sm:-mx-5"
        value={tab}
        onChange={(key) => setTab(key as Tab)}
        items={[
          { key: 'exames', label: 'Exames', disabled: !hasModule('lab') },
          { key: 'consultas', label: 'Consultas' },
          { key: 'vacinas', label: 'Vacinas', disabled: !hasModule('immunization') },
          { key: 'receitas', label: 'Receitas' },
        ]}
      />

      {tab === 'exames' &&
        (exams.error ? (
          <ErrorState message={errorMessage(exams.error)} onRetry={() => void exams.refetch()} />
        ) : exams.isLoading ? (
          <ListSkeleton rows={3} />
        ) : (exams.data?.items.length ?? 0) === 0 ? (
          <Empty>Nenhum exame solicitado para este paciente.</Empty>
        ) : (
          <ul className="space-y-2">
            {exams.data!.items.map((order, index) => (
              <ExamOrderRow key={order.id} order={order} defaultOpen={index === 0 && order.items.some((item) => item.result)} />
            ))}
          </ul>
        ))}

      {tab === 'consultas' &&
        (!can('record:read_sensitive') ? (
          <Empty>Seu perfil não tem acesso ao conteúdo clínico das consultas.</Empty>
        ) : record.error ? (
          <ErrorState message={errorMessage(record.error)} onRetry={() => void record.refetch()} />
        ) : record.isLoading ? (
          <ListSkeleton rows={3} />
        ) : previous.length === 0 ? (
          <Empty>Nenhuma consulta anterior registrada.</Empty>
        ) : (
          <div className="space-y-2">
            {previous.map((entry, index) => (
              <RecordEncounterEntry key={entry.encounter.id} entry={entry} patientId={patientId} defaultOpen={index === 0} />
            ))}
          </div>
        ))}

      {tab === 'vacinas' &&
        (vaccines.error ? (
          <ErrorState message={errorMessage(vaccines.error)} onRetry={() => void vaccines.refetch()} />
        ) : vaccines.isLoading ? (
          <ListSkeleton rows={3} />
        ) : (vaccines.data?.immunizations.length ?? 0) + (vaccines.data?.preventives.length ?? 0) === 0 ? (
          <Empty>Nenhuma vacina ou preventivo registrado.</Empty>
        ) : (
          <ul className="divide-y divide-[var(--border)] rounded-[var(--radius)] border border-[var(--border)]">
            {vaccines.data!.immunizations.map((item) => (
              <li key={item.id} className="px-3.5 py-2.5">
                <p className="flex flex-wrap items-center gap-2 text-[14px] font-medium text-[var(--ink)]">
                  {item.vaccineName}
                  {item.doseNumber ? <span className="text-[12px] font-normal text-[var(--ink-3)]">{item.doseNumber}ª dose</span> : null}
                  {item.status !== 'completed' && <Badge tone="muted">Cancelada</Badge>}
                </p>
                <p className="text-[12.5px] text-[var(--ink-3)]">
                  {formatDate(item.administeredAt)}
                  {item.lotNumber ? ` · lote ${item.lotNumber}` : ''}
                  {item.nextDueAt ? ` · próxima ${formatDateShort(item.nextDueAt)}` : ''}
                </p>
              </li>
            ))}
            {vaccines.data!.preventives.map((item) => (
              <li key={item.id} className="px-3.5 py-2.5">
                <p className="text-[14px] font-medium text-[var(--ink)]">{item.productName}</p>
                <p className="text-[12.5px] text-[var(--ink-3)]">
                  {item.kind === 'deworming' ? 'Vermífugo' : item.kind === 'ectoparasite' ? 'Antiparasitário' : 'Preventivo'}
                  {' · '}
                  {formatDate(item.administeredAt)}
                  {item.nextDueAt ? ` · próxima ${formatDateShort(item.nextDueAt)}` : ''}
                </p>
              </li>
            ))}
          </ul>
        ))}

      {tab === 'receitas' &&
        (prescriptions.error ? (
          <ErrorState message={errorMessage(prescriptions.error)} onRetry={() => void prescriptions.refetch()} />
        ) : prescriptions.isLoading ? (
          <ListSkeleton rows={3} />
        ) : (prescriptions.data?.items.length ?? 0) === 0 ? (
          <Empty>Nenhuma receita registrada.</Empty>
        ) : (
          <div className="space-y-2">
            {prescriptions.data!.items.map((prescription) => (
              <PrescriptionBlock key={prescription.id} prescription={prescription} />
            ))}
          </div>
        ))}

      <div className="mt-4 border-t border-[var(--border)] pt-3 text-center">
        <Link href={`/pacientes/${patientId}`} className="text-[13px] font-medium text-[var(--brand)]">
          Abrir a ficha completa do paciente
        </Link>
      </div>
    </Sheet>
  );
}

export function PatientHistorySheet(props: React.ComponentProps<typeof PatientHistorySheetContent>) {
  return (
    <MountWhenOpen open={props.open}>
      <PatientHistorySheetContent {...props} />
    </MountWhenOpen>
  );
}
