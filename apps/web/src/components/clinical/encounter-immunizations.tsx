'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Syringe } from 'lucide-react';
import type { Immunization, PreventiveTreatment } from '@chiron/contracts';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Card, CardHeader, ListSkeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { AppliedRecordList, mergeRecords } from '@/components/immunization/applied-records';
import { PreventiveSheet, VaccineSheet } from '@/components/immunization/immunization-sheets';

export function EncounterImmunizations({
  encounterId,
  patientId,
  writable,
  vaccineOpen: controlledOpen,
  onVaccineOpenChange,
}: {
  encounterId: string;
  patientId: string;
  writable: boolean;
  /** Aberto de fora, pela barra de ações do celular. */
  vaccineOpen?: boolean;
  onVaccineOpenChange?: (open: boolean) => void;
}) {
  const { can } = useSession();
  const [internalOpen, setInternalOpen] = useState(false);
  const vaccineOpen = controlledOpen ?? internalOpen;
  const setVaccineOpen = onVaccineOpenChange ?? setInternalOpen;
  const [preventiveOpen, setPreventiveOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['immunizations', encounterId],
    queryFn: () =>
      api.get<{ immunizations: Immunization[]; preventives: PreventiveTreatment[] }>('/immunizations', {
        encounterId,
        limit: 50,
      }),
  });

  const records = mergeRecords(data);
  const canVaccine = writable && can('immunization:apply');
  const canPreventive = writable && can('preventive:record');

  return (
    <>
      <Card>
        <CardHeader
          title="Vacinas e preventivos"
          action={
            canVaccine || canPreventive ? (
              <div className="flex gap-2">
                {canPreventive && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setPreventiveOpen(true)}
                    title="Vermífugo, antipulgas e carrapatos ou outro preventivo"
                  >
                    Preventivo
                  </Button>
                )}
                {canVaccine && (
                  <Button size="sm" onClick={() => setVaccineOpen(true)}>
                    <Plus className="h-4 w-4" />
                    Vacina
                  </Button>
                )}
              </div>
            ) : undefined
          }
        />

        {isLoading ? (
          <ListSkeleton rows={2} />
        ) : records.length === 0 ? (
          <p className="flex items-center gap-2 px-4 py-3.5 text-[13.5px] text-[var(--ink-3)]">
            <Syringe className="h-4 w-4" />
            Nenhuma aplicação neste atendimento.
          </p>
        ) : (
          // Corrigir e cancelar dependem da permissão, não do atendimento estar
          // aberto: lote digitado errado aparece muitas vezes depois de finalizar.
          <AppliedRecordList records={records} />
        )}
      </Card>

      <VaccineSheet open={vaccineOpen} onOpenChange={setVaccineOpen} encounterId={encounterId} patientId={patientId} />
      <PreventiveSheet
        open={preventiveOpen}
        onOpenChange={setPreventiveOpen}
        encounterId={encounterId}
        patientId={patientId}
      />
    </>
  );
}
