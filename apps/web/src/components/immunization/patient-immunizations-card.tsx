'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Syringe } from 'lucide-react';
import type { Immunization, PreventiveTreatment } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Card, CardHeader, ErrorState, ListSkeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { AppliedRecordList, mergeRecords } from './applied-records';
import { PreventiveSheet, VaccineSheet } from './immunization-sheets';

const VISIBLE = 5;

/**
 * Carteira do paciente na ficha. Vacina e preventivo nem sempre passam por
 * consulta: a dose do balcão e a carteira trazida pelo tutor entram por aqui,
 * sem abrir atendimento.
 */
export function PatientImmunizationsCard({ patientId, active }: { patientId: string; active: boolean }) {
  const { can, hasModule } = useSession();
  const enabled = hasModule('immunization') && can('immunization:read');
  const [vaccineOpen, setVaccineOpen] = useState(false);
  const [preventiveOpen, setPreventiveOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // Mesma chave e mesma busca do histórico aberto no atendimento: um cache só.
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['immunizations', 'patient', patientId],
    queryFn: () =>
      api.get<{ immunizations: Immunization[]; preventives: PreventiveTreatment[] }>('/immunizations', {
        patientId,
        limit: 60,
      }),
    enabled,
  });

  if (!enabled) return null;

  const records = mergeRecords(data);
  const visible = showAll ? records : records.slice(0, VISIBLE);
  const canVaccine = active && can('immunization:apply');
  const canPreventive = active && can('preventive:record');

  return (
    <Card>
      <CardHeader title="Vacinas e preventivos" />

      {(canVaccine || canPreventive) && (
        <div className="flex gap-2 border-b border-[var(--border)] px-4 py-2.5">
          {canVaccine && (
            <Button size="sm" onClick={() => setVaccineOpen(true)} className="flex-1 sm:flex-none">
              <Plus className="h-4 w-4" />
              Vacina
            </Button>
          )}
          {canPreventive && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setPreventiveOpen(true)}
              className="flex-1 sm:flex-none"
              title="Vermífugo, antipulgas e carrapatos ou outro preventivo"
            >
              <Plus className="h-4 w-4" />
              Preventivo
            </Button>
          )}
        </div>
      )}

      {error ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <ListSkeleton rows={2} />
      ) : records.length === 0 ? (
        <p className="flex items-start gap-2 px-4 py-3.5 text-[13.5px] text-[var(--ink-3)]">
          <Syringe className="mt-0.5 h-4 w-4 shrink-0" />
          Nenhuma vacina ou preventivo registrado. Dose aplicada em outra clínica também entra aqui.
        </p>
      ) : (
        <>
          <AppliedRecordList records={visible} />
          {records.length > VISIBLE && (
            <div className="border-t border-[var(--border)] p-2">
              <Button variant="ghost" size="sm" block onClick={() => setShowAll((current) => !current)}>
                {showAll ? 'Mostrar menos' : `Mostrar todas (${records.length})`}
              </Button>
            </div>
          )}
        </>
      )}

      <VaccineSheet open={vaccineOpen} onOpenChange={setVaccineOpen} patientId={patientId} />
      <PreventiveSheet open={preventiveOpen} onOpenChange={setPreventiveOpen} patientId={patientId} />
    </Card>
  );
}
