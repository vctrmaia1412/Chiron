'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Appointment } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { formatTime } from '@/lib/format';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';

/**
 * Check-in abre o atendimento na mesma transação. O peso aferido na recepção
 * entra como primeira observação e passa a valer para o cálculo de dose, que
 * é o motivo de ele ser pedido aqui e não depois.
 */
export function CheckInSheet({
  appointment,
  onClose,
  onCheckedIn,
}: {
  appointment: Appointment | null;
  onClose: () => void;
  onCheckedIn?: (encounterId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [weight, setWeight] = useState('');
  const [weightUom, setWeightUom] = useState<'kg' | 'g'>('kg');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (appointment) {
      setWeight('');
      setWeightUom('kg');
      setNotes('');
    }
  }, [appointment]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!appointment) throw new Error('Agendamento não informado.');
      const numeric = weight.trim() === '' ? undefined : Number(weight.replace(',', '.'));
      return api.post<{ appointment: Appointment; encounterId: string }>(
        `/appointments/${appointment.id}/check-in`,
        {
          weightKg: numeric && weightUom === 'g' ? numeric / 1000 : numeric,
          weightUom: 'kg',
          notes: notes.trim() || undefined,
        },
      );
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
      await queryClient.invalidateQueries({ queryKey: ['encounters'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Check-in realizado. Atendimento aberto.');
      onClose();
      if (result.encounterId) onCheckedIn?.(result.encounterId);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Sheet
      open={Boolean(appointment)}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Check-in"
      description={
        appointment
          ? `${appointment.patient?.name ?? appointment.guardian?.name ?? 'Paciente'} · ${formatTime(appointment.startAt)}`
          : undefined
      }
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} className="sm:w-auto">
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} className="sm:w-auto">
            Confirmar chegada
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field
          label="Peso aferido"
          hint="Opcional aqui, obrigatório para prescrever dose por quilo."
        >
          <div className="flex gap-2">
            <Input
              autoFocus
              value={weight}
              onChange={(event) => setWeight(event.target.value)}
              inputMode="decimal"
              placeholder={weightUom === 'g' ? '92' : '8,4'}
            />
            <Select
              value={weightUom}
              onChange={(event) => setWeightUom(event.target.value as 'kg' | 'g')}
              className="w-24"
            >
              <option value="kg">kg</option>
              <option value="g">g</option>
            </Select>
          </div>
        </Field>

        <Field label="Observação da recepção">
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            placeholder="Ex.: tutor relata piora desde ontem"
          />
        </Field>

        <p className="rounded-[var(--radius)] bg-[var(--surface-2)] px-3 py-2 text-[12.5px] text-[var(--ink-3)]">
          O atendimento é aberto agora e entra na fila com status de aguardando.
        </p>
      </div>
    </Sheet>
  );
}
