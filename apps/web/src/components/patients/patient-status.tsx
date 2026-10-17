'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Archive, RotateCcw } from 'lucide-react';
import type { Patient } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { InactivateSheet, type InactivationReason } from '@/components/registry/inactivate-sheet';

const PATIENT_REASONS: InactivationReason[] = [
  { label: 'Não é mais cliente' },
  { label: 'Transferido para outra clínica', transferred: true },
  { label: 'Mudou de cidade' },
  { label: 'Cadastro duplicado' },
];

function usePatientStatusRefresh(patientId: string) {
  const queryClient = useQueryClient();
  return (updated: Patient) => {
    queryClient.setQueryData(['patient', patientId], updated);
    void queryClient.invalidateQueries({ queryKey: ['patients'] });
  };
}

/** Faixa no topo da ficha de paciente inativo ou transferido, com o caminho de volta. */
export function PatientInactiveBanner({ patient }: { patient: Patient }) {
  const { can } = useSession();
  const refresh = usePatientStatusRefresh(patient.id);

  const reactivate = useMutation({
    mutationFn: () => api.post<Patient>(`/patients/${patient.id}/reactivate`),
    onSuccess: (updated) => {
      refresh(updated);
      toast.success('Cadastro reativado. O paciente volta a aparecer na agenda e no atendimento.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (patient.status !== 'inactive' && patient.status !== 'transferred') return null;

  const label = patient.status === 'transferred' ? 'Transferido' : 'Cadastro inativo';
  const since = patient.inactivatedAt ? ` desde ${formatDate(patient.inactivatedAt)}` : '';

  return (
    <div className="mb-4 flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-2.5 text-[13.5px] text-[var(--ink-2)] sm:flex-row sm:items-center">
      <Archive className="hidden h-4 w-4 shrink-0 text-[var(--ink-3)] sm:block" aria-hidden />
      <p className="min-w-0 flex-1">
        <strong className="font-semibold text-[var(--ink)]">
          {label}
          {since}.
        </strong>{' '}
        {patient.inactiveReason ? `Motivo: ${patient.inactiveReason}. ` : ''}
        Fora da agenda e do atendimento; o prontuário continua disponível.
      </p>
      {can('patient:update') && (
        <Button
          variant="secondary"
          size="sm"
          className="self-start sm:self-auto"
          onClick={() => reactivate.mutate()}
          loading={reactivate.isPending}
        >
          <RotateCcw className="h-4 w-4" />
          Reativar
        </Button>
      )}
    </div>
  );
}

/** Botão discreto no cartão de cadastro: inativar é raro e não pode competir com "Atender". */
export function PatientStatusAction({ patient }: { patient: Patient }) {
  const { can } = useSession();
  const refresh = usePatientStatusRefresh(patient.id);
  const [open, setOpen] = useState(false);

  const inactivate = useMutation({
    mutationFn: (input: { reason: string; transferred: boolean }) =>
      api.post<Patient>(`/patients/${patient.id}/inactivate`, input),
    onSuccess: (updated) => {
      refresh(updated);
      setOpen(false);
      toast.success(
        updated.status === 'transferred' ? 'Paciente marcado como transferido.' : 'Cadastro do paciente inativado.',
      );
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (patient.status !== 'active' || !can('patient:update')) return null;

  return (
    <>
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => setOpen(true)}>
        <Archive className="h-4 w-4" />
        Inativar cadastro
      </Button>
      <InactivateSheet
        open={open}
        onOpenChange={setOpen}
        title={`Inativar ${patient.name}`}
        description="Para quem deixou de ser cliente. Óbito tem registro próprio."
        reasons={PATIENT_REASONS}
        loading={inactivate.isPending}
        onConfirm={(input) => inactivate.mutate(input)}
        note={
          <>
            O paciente sai das buscas da agenda e do atendimento, mas continua na lista de pacientes (filtro
            &ldquo;Inativos&rdquo;) com o prontuário intacto. Agendamentos já marcados não são cancelados. Dá para
            reativar quando quiser.
          </>
        }
      />
    </>
  );
}
