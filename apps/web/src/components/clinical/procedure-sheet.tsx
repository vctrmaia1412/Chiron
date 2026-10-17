'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { useServices } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { MountWhenOpen } from '@/components/ui/mount-when-open';

const COMMON = ['Limpeza otológica', 'Curativo', 'Drenagem de abscesso', 'Fluidoterapia', 'Coleta de sangue', 'Sutura'];

/**
 * Procedimento feito no atendimento. Os serviços da clínica marcados como
 * procedimento ou cirurgia aparecem como atalho, e escolher um deles liga o
 * registro ao serviço para a cobrança sair certa.
 */
function ProcedureSheetContent({
  open,
  onOpenChange,
  encounterId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  encounterId: string;
}) {
  const queryClient = useQueryClient();
  const { data: services = [] } = useServices();
  const procedureServices = services.filter((service) => ['procedure', 'surgery'].includes(service.category));

  const [description, setDescription] = useState('');
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/encounters/${encounterId}/procedures`, {
        description: description.trim(),
        serviceId: serviceId ?? undefined,
        notes: notes.trim() || undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['encounter', encounterId] });
      toast.success('Procedimento registrado.');
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const chip = (label: string, active: boolean, onClick: () => void, key: string) => (
    <button
      key={key}
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-[13px] font-medium',
        active
          ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-ink)]'
          : 'border-[var(--border-strong)] text-[var(--ink-2)] hover:bg-[var(--surface-2)]',
      )}
    >
      {label}
    </button>
  );

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Procedimento"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} className="sm:w-auto">
            Cancelar
          </Button>
          <Button
            onClick={() => {
              if (description.trim().length < 3) {
                toast.error('Descreva o procedimento.');
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
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {procedureServices.map((service) =>
            chip(
              service.name,
              serviceId === service.id,
              () => {
                setServiceId(service.id);
                setDescription(service.name);
              },
              service.id,
            ),
          )}
          {COMMON.map((label) =>
            chip(
              label,
              !serviceId && description === label,
              () => {
                setServiceId(null);
                setDescription(label);
              },
              label,
            ),
          )}
        </div>
        <Field label="Descrição" required htmlFor="procedure-description">
          <Input
            id="procedure-description"
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
              setServiceId(null);
            }}
            placeholder="O que foi feito"
          />
        </Field>
        <Field label="Detalhes" htmlFor="procedure-notes">
          <Textarea
            id="procedure-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            placeholder="Técnica, material, intercorrências"
          />
        </Field>
      </div>
    </Sheet>
  );
}

export function ProcedureSheet(props: React.ComponentProps<typeof ProcedureSheetContent>) {
  return (
    <MountWhenOpen open={props.open}>
      <ProcedureSheetContent {...props} />
    </MountWhenOpen>
  );
}
