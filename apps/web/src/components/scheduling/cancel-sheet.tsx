'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Appointment } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Field, Select, Textarea } from '@/components/ui/field';

const REASONS = [
  'Tutor solicitou remarcação',
  'Tutor não pôde comparecer',
  'Profissional indisponível',
  'Paciente sem condições no momento',
  'Erro de agendamento',
];

function CancelAppointmentSheetContent({
  appointment,
  onClose,
}: {
  appointment: Appointment | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState(REASONS[0]!);
  const [detail, setDetail] = useState('');
  const [markNoShow, setMarkNoShow] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!appointment) throw new Error('Agendamento não informado.');
      const fullReason = detail.trim() ? `${reason}: ${detail.trim()}` : reason;
      if (markNoShow) {
        return api.post(`/appointments/${appointment.id}/no-show`, { reason: fullReason });
      }
      return api.post(`/appointments/${appointment.id}/cancel`, { reason: fullReason });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(markNoShow ? 'Falta registrada.' : 'Agendamento cancelado.');
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Sheet
      open={Boolean(appointment)}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={markNoShow ? 'Registrar falta' : 'Cancelar agendamento'}
      description={appointment ? formatDateTime(appointment.startAt) : undefined}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} className="sm:w-auto">
            Voltar
          </Button>
          <Button
            variant="danger"
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            className="sm:w-auto"
          >
            {markNoShow ? 'Registrar falta' : 'Cancelar agendamento'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Motivo" required>
          <Select value={reason} onChange={(event) => setReason(event.target.value)}>
            {REASONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Detalhe">
          <Textarea value={detail} onChange={(event) => setDetail(event.target.value)} rows={2} />
        </Field>

        <label className="flex items-center gap-2 text-[13.5px] text-[var(--ink-2)]">
          <input
            type="checkbox"
            checked={markNoShow}
            onChange={(event) => setMarkNoShow(event.target.checked)}
            className="h-4 w-4 accent-[var(--brand)]"
          />
          O tutor não compareceu (registrar como falta)
        </label>

        <p className="rounded-[var(--radius)] bg-[var(--surface-2)] px-3 py-2 text-[12.5px] text-[var(--ink-3)]">
          O agendamento não é apagado: fica no histórico com o motivo e o autor da ação.
        </p>
      </div>
    </Sheet>
  );
}

export function CancelAppointmentSheet(props: React.ComponentProps<typeof CancelAppointmentSheetContent>) {
  return props.appointment ? <CancelAppointmentSheetContent {...props} /> : null;
}
