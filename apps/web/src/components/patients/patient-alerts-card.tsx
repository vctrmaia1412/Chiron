'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import type { Patient, PatientAlertKind } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { ALERT_KIND, labelFor } from '@/lib/labels';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/cn';
import { Card, CardHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { ConfirmSheet, Sheet } from '@/components/ui/sheet';
import { MountWhenOpen } from '@/components/ui/mount-when-open';

type Alert = Patient['alerts'][number];

/** Os avisos que a equipe mais usa, a um toque. */
const QUICK_ALERTS: Array<{ label: string; kind: PatientAlertKind; message: string }> = [
  { label: 'Agressivo', kind: 'aggressive', message: 'Agressivo' },
  { label: 'Morde', kind: 'aggressive', message: 'Morde' },
  { label: 'Usar focinheira', kind: 'aggressive', message: 'Usar focinheira no manejo' },
  { label: 'Medo de manipulação', kind: 'aggressive', message: 'Medo de manipulação' },
  { label: 'Risco de contágio', kind: 'contagious', message: 'Risco de contágio: isolar' },
  { label: 'Dieta especial', kind: 'special_diet', message: 'Dieta especial' },
];

const KIND_ORDER: PatientAlertKind[] = ['aggressive', 'contagious', 'special_diet', 'financial_block', 'other'];

/**
 * Alertas de manejo ("agressivo", "morde"): aparecem no topo da ficha para
 * toda a equipe até alguém desativar. Desativar não apaga o registro.
 */
export function PatientAlertsCard({ patient }: { patient: Patient }) {
  const { can } = useSession();
  const queryClient = useQueryClient();
  const canEdit = can('patient:update');
  const alerts = patient.alerts.filter((alert) => alert.active);
  const [addOpen, setAddOpen] = useState(false);
  const [removing, setRemoving] = useState<Alert | null>(null);

  const deactivate = useMutation({
    mutationFn: (alertId: string) => api.delete(`/patients/${patient.id}/alerts/${alertId}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['patient', patient.id] });
      void queryClient.invalidateQueries({ queryKey: ['patients'] });
      setRemoving(null);
      toast.success('Alerta desativado.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (!canEdit && alerts.length === 0) return null;

  return (
    <Card>
      <CardHeader
        title="Alertas de manejo"
        action={
          canEdit ? (
            <Button variant="ghost" size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Adicionar
            </Button>
          ) : undefined
        }
      />
      {alerts.length === 0 ? (
        <p className="px-4 py-3 text-[13.5px] text-[var(--ink-3)]">
          Nenhum alerta ativo. Use para avisar a equipe: agressivo, morde, risco de contágio.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {alerts.map((alert) => (
            <li key={alert.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-[var(--ink)]">{labelFor(ALERT_KIND, alert.kind)}</p>
                <p className="break-words text-[13px] text-[var(--ink-2)]">{alert.message}</p>
                {alert.kind === 'no_guardian' && (
                  <p className="text-[12px] text-[var(--ink-3)]">Sai sozinho ao vincular um tutor.</p>
                )}
              </div>
              {canEdit && alert.kind !== 'no_guardian' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setRemoving(alert)}
                  aria-label={`Desativar alerta: ${alert.message}`}
                >
                  Desativar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <AlertSheet open={addOpen} onOpenChange={setAddOpen} patientId={patient.id} />

      <ConfirmSheet
        open={removing !== null}
        onOpenChange={(next) => {
          if (!next) setRemoving(null);
        }}
        title="Desativar alerta"
        confirmLabel="Desativar"
        loading={deactivate.isPending}
        onConfirm={() => {
          if (removing) deactivate.mutate(removing.id);
        }}
      >
        <p className="text-sm text-[var(--ink-2)]">
          &ldquo;{removing?.message}&rdquo; deixa de aparecer na ficha e no atendimento. Quem desativou e quando ficam
          registrados.
        </p>
      </ConfirmSheet>
    </Card>
  );
}

function AlertSheetContent({
  open,
  onOpenChange,
  patientId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
}) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<PatientAlertKind>('aggressive');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.post(`/patients/${patientId}/alerts`, { kind, message: message.trim() }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['patient', patientId] });
      void queryClient.invalidateQueries({ queryKey: ['patients'] });
      toast.success('Alerta adicionado. A equipe vê no topo da ficha.');
      onOpenChange(false);
    },
    onError: (caught) => toast.error(errorMessage(caught)),
  });

  function submit() {
    if (!message.trim()) {
      setError('Escreva o aviso ou toque em uma das opções.');
      return;
    }
    mutation.mutate();
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Novo alerta de manejo"
      description="Aparece no topo da ficha para toda a equipe até ser desativado."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} className="sm:w-auto">
            Cancelar
          </Button>
          <Button onClick={submit} loading={mutation.isPending} className="sm:w-auto">
            Adicionar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {QUICK_ALERTS.map((quick) => {
            const active = kind === quick.kind && message === quick.message;
            return (
              <button
                key={quick.label}
                type="button"
                onClick={() => {
                  setKind(quick.kind);
                  setMessage(quick.message);
                  setError(null);
                }}
                className={cn(
                  'min-h-10 rounded-full border px-3 text-[13.5px] font-medium transition-colors',
                  active
                    ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-ink)]'
                    : 'border-[var(--border-strong)] bg-[var(--surface)] text-[var(--ink-2)] hover:bg-[var(--surface-2)]',
                )}
              >
                {quick.label}
              </button>
            );
          })}
        </div>

        <Field label="Tipo">
          <Select value={kind} onChange={(event) => setKind(event.target.value as PatientAlertKind)}>
            {KIND_ORDER.map((key) => (
              <option key={key} value={key}>
                {ALERT_KIND[key]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Aviso" required error={error}>
          <Input
            value={message}
            onChange={(event) => {
              setMessage(event.target.value);
              setError(null);
            }}
            maxLength={200}
            placeholder="Ex.: morde ao manipular as patas"
          />
        </Field>
      </div>
    </Sheet>
  );
}

function AlertSheet(props: React.ComponentProps<typeof AlertSheetContent>) {
  return (
    <MountWhenOpen open={props.open}>
      <AlertSheetContent {...props} />
    </MountWhenOpen>
  );
}
