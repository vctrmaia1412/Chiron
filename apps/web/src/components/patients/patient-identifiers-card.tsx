'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import type { Patient, PatientIdentifierScheme } from '@chiron/contracts';
import { ApiError, api, errorMessage } from '@/lib/api';
import { IDENTIFIER_SCHEME, labelFor } from '@/lib/labels';
import { useSession } from '@/lib/session';
import { Card, CardHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { ConfirmSheet, Sheet } from '@/components/ui/sheet';
import { MountWhenOpen } from '@/components/ui/mount-when-open';

type Identifier = Patient['identifiers'][number];

const SCHEME_ORDER: PatientIdentifierScheme[] = [
  'microchip',
  'registry',
  'passport',
  'ear_tag',
  'sisbov',
  'leg_band',
  'tattoo',
  'license',
  'internal',
];

/**
 * Microchip e outros números do animal. Número errado sai da ficha (remoção
 * lógica) e o certo entra no lugar; a API recusa número que já está em outro
 * animal e diz em qual.
 */
export function PatientIdentifiersCard({ patient }: { patient: Patient }) {
  const { can } = useSession();
  const queryClient = useQueryClient();
  const canEdit = can('patient:update');
  const [addOpen, setAddOpen] = useState(false);
  const [removing, setRemoving] = useState<Identifier | null>(null);

  const remove = useMutation({
    mutationFn: (identifierId: string) => api.delete(`/patients/${patient.id}/identifiers/${identifierId}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['patient', patient.id] });
      void queryClient.invalidateQueries({ queryKey: ['patients'] });
      setRemoving(null);
      toast.success('Identificador removido da ficha.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (!canEdit && patient.identifiers.length === 0) return null;

  return (
    <Card>
      <CardHeader
        title="Identificação"
        action={
          canEdit ? (
            <Button variant="ghost" size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Adicionar
            </Button>
          ) : undefined
        }
      />
      {patient.identifiers.length === 0 ? (
        <p className="px-4 py-3 text-[13.5px] text-[var(--ink-3)]">Sem microchip ou outro identificador.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {patient.identifiers.map((identifier) => (
            <li key={identifier.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="text-[12.5px] text-[var(--ink-3)]">
                  {labelFor(IDENTIFIER_SCHEME, identifier.scheme)}
                  {identifier.issuer ? ` · ${identifier.issuer}` : ''}
                </p>
                <p className="break-all font-mono text-[14px] font-medium text-[var(--ink)]">{identifier.value}</p>
              </div>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setRemoving(identifier)}
                  aria-label={`Remover ${labelFor(IDENTIFIER_SCHEME, identifier.scheme)} ${identifier.value}`}
                >
                  Remover
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <IdentifierSheet open={addOpen} onOpenChange={setAddOpen} patientId={patient.id} />

      <ConfirmSheet
        open={removing !== null}
        onOpenChange={(next) => {
          if (!next) setRemoving(null);
        }}
        title="Remover identificador"
        confirmLabel="Remover"
        destructive
        loading={remove.isPending}
        onConfirm={() => {
          if (removing) remove.mutate(removing.id);
        }}
      >
        <p className="text-sm text-[var(--ink-2)]">
          {removing ? labelFor(IDENTIFIER_SCHEME, removing.scheme) : ''}{' '}
          <span className="font-mono">{removing?.value}</span> sai da ficha e da busca, e o número fica livre para ser
          cadastrado de novo. O registro anterior continua na auditoria.
        </p>
      </ConfirmSheet>
    </Card>
  );
}

function IdentifierSheetContent({
  open,
  onOpenChange,
  patientId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
}) {
  const queryClient = useQueryClient();
  const [scheme, setScheme] = useState<PatientIdentifierScheme>('microchip');
  const [value, setValue] = useState('');
  const [issuer, setIssuer] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/patients/${patientId}/identifiers`, {
        scheme,
        value: value.trim(),
        issuer: issuer.trim() || undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['patient', patientId] });
      void queryClient.invalidateQueries({ queryKey: ['patients'] });
      toast.success('Identificador adicionado.');
      onOpenChange(false);
    },
    onError: (caught) => {
      // Número repetido: a mensagem diz em qual animal ele está, então fica no campo.
      if (caught instanceof ApiError && (caught.isConflict || caught.fieldIssues.length > 0)) {
        setError(caught.fieldIssues.find((issue) => issue.path === 'value')?.message ?? caught.message);
        return;
      }
      toast.error(errorMessage(caught));
    },
  });

  function submit() {
    if (!value.trim()) {
      setError('Informe o número.');
      return;
    }
    mutation.mutate();
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Adicionar identificador"
      description="Microchip, registro de raça, passaporte, brinco ou anilha."
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
        <Field label="Tipo">
          <Select value={scheme} onChange={(event) => setScheme(event.target.value as PatientIdentifierScheme)}>
            {SCHEME_ORDER.map((key) => (
              <option key={key} value={key}>
                {IDENTIFIER_SCHEME[key]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Número"
          required
          error={error}
          hint={scheme === 'microchip' ? 'Espaços e hífens são ignorados.' : undefined}
        >
          <Input
            autoFocus
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
            inputMode={scheme === 'microchip' ? 'numeric' : 'text'}
            autoComplete="off"
            maxLength={80}
            placeholder={scheme === 'microchip' ? '15 dígitos' : undefined}
            className="font-mono"
          />
        </Field>
        <Field label="Emissor" hint="Opcional: associação, órgão ou fabricante.">
          <Input value={issuer} onChange={(event) => setIssuer(event.target.value)} maxLength={80} />
        </Field>
      </div>
    </Sheet>
  );
}

function IdentifierSheet(props: React.ComponentProps<typeof IdentifierSheetContent>) {
  return (
    <MountWhenOpen open={props.open}>
      <IdentifierSheetContent {...props} />
    </MountWhenOpen>
  );
}
