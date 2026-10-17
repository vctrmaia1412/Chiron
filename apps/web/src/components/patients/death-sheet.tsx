'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Patient } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { toIsoDate } from '@/lib/format';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { MountWhenOpen } from '@/components/ui/mount-when-open';

const BODY_DISPOSITION = [
  { value: 'undefined', label: 'Ainda não definido' },
  { value: 'guardian', label: 'Entregue ao tutor' },
  { value: 'cremation', label: 'Cremação' },
  { value: 'burial', label: 'Sepultamento' },
  { value: 'other', label: 'Outro' },
];

export interface RecordedDeath {
  occurredAt: string;
  causeText: string;
}

/**
 * Registro de óbito: muda a situação do paciente, cancela os agendamentos
 * futuros e desliga os lembretes de vacina, tudo numa transação no servidor.
 * O prontuário continua consultável.
 */
function DeathSheetContent({
  open,
  onOpenChange,
  patient,
  encounterId,
  onRecorded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patient: Patient;
  encounterId?: string;
  onRecorded?: (death: RecordedDeath) => void;
}) {
  const queryClient = useQueryClient();
  const [now] = useState(() => new Date());
  const [date, setDate] = useState(() => toIsoDate(now));
  const [time, setTime] = useState(() => now.toTimeString().slice(0, 5));
  const [kind, setKind] = useState<'natural' | 'euthanasia'>('natural');
  const [cause, setCause] = useState('');
  const [bodyDisposition, setBodyDisposition] = useState('undefined');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/patients/${patient.id}/deceased`, {
        occurredAt: new Date(`${date}T${time}:00`).toISOString(),
        kind,
        causeText: cause.trim() || undefined,
        encounterId,
        bodyDisposition,
        notes: notes.trim() || undefined,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['patient', patient.id] }),
        queryClient.invalidateQueries({ queryKey: ['patients'] }),
        queryClient.invalidateQueries({ queryKey: ['appointments'] }),
        queryClient.invalidateQueries({ queryKey: ['timeline', patient.id] }),
        queryClient.invalidateQueries({ queryKey: ['immunizations'] }),
      ]);
      toast.success('Óbito registrado. Agendamentos futuros cancelados e lembretes desligados.');
      onOpenChange(false);
      onRecorded?.({ occurredAt: date, causeText: cause.trim() });
    },
    onError: (caught) => toast.error(errorMessage(caught)),
  });

  function submit() {
    if (!date || !time) {
      setError('Informe a data e a hora.');
      return;
    }
    if (new Date(`${date}T${time}:00`) > new Date()) {
      setError('A data do óbito não pode estar no futuro.');
      return;
    }
    setError(null);
    mutation.mutate();
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Registrar óbito de ${patient.name}`}
      description="O prontuário continua disponível. Agendamentos futuros são cancelados e os lembretes, desligados."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} className="sm:w-auto">
            Cancelar
          </Button>
          <Button variant="danger" onClick={submit} loading={mutation.isPending} className="sm:w-auto">
            Registrar óbito
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data" required error={error ?? undefined}>
            <Input type="date" value={date} max={toIsoDate(now)} onChange={(event) => setDate(event.target.value)} />
          </Field>
          <Field label="Hora" required>
            <Input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
          </Field>
        </div>

        <Field label="Tipo">
          <Select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
            <option value="natural">Natural</option>
            <option value="euthanasia">Eutanásia</option>
          </Select>
        </Field>

        <Field label="Causa provável">
          <Input value={cause} onChange={(event) => setCause(event.target.value)} placeholder="Ex.: insuficiência renal crônica" />
        </Field>

        <Field label="Destino do corpo">
          <Select value={bodyDisposition} onChange={(event) => setBodyDisposition(event.target.value)}>
            {BODY_DISPOSITION.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Observações">
          <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} />
        </Field>

        {kind === 'euthanasia' && (
          <p className="rounded-[var(--radius)] bg-[var(--surface-2)] px-3 py-2 text-[12.5px] text-[var(--ink-3)]">
            Na eutanásia, o termo de consentimento assinado pelo tutor pode ser gerado em Documentos.
          </p>
        )}
      </div>
    </Sheet>
  );
}

export function DeathSheet(props: React.ComponentProps<typeof DeathSheetContent>) {
  return (
    <MountWhenOpen open={props.open}>
      <DeathSheetContent {...props} />
    </MountWhenOpen>
  );
}
