'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';

export function DiagnosisSheet({
  open,
  onOpenChange,
  encounterId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  encounterId: string;
}) {
  const queryClient = useQueryClient();
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<'differential' | 'presumptive' | 'final' | 'ruled_out'>('presumptive');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) {
      setDescription('');
      setKind('presumptive');
      setNotes('');
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/encounters/${encounterId}/diagnoses`, {
        description: description.trim(),
        kind,
        notes: notes.trim() || undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['encounter', encounterId] });
      toast.success('Diagnóstico registrado.');
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Registrar diagnóstico"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} className="sm:w-auto">
            Cancelar
          </Button>
          <Button
            onClick={() => {
              if (description.trim().length < 3) {
                toast.error('Descreva o diagnóstico.');
                return;
              }
              mutation.mutate();
            }}
            loading={mutation.isPending}
            className="sm:w-auto"
          >
            Registrar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Diagnóstico" required>
          <Input
            autoFocus
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Ex.: Otite externa bilateral"
          />
        </Field>

        <Field label="Classificação" hint="Diferencial, presuntivo, definitivo ou descartado.">
          <Select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
            <option value="differential">Diferencial</option>
            <option value="presumptive">Presuntivo</option>
            <option value="final">Definitivo</option>
            <option value="ruled_out">Descartado</option>
          </Select>
        </Field>

        <Field label="Observação">
          <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
        </Field>
      </div>
    </Sheet>
  );
}
