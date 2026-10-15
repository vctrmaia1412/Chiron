'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { PatientAllergy } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';

const OUTCOMES = [
  {
    status: 'inactive' as const,
    title: 'Não se aplica mais',
    description: 'Era alergia, mas deixou de ser relevante.',
  },
  {
    status: 'refuted' as const,
    title: 'Não era alergia',
    description: 'Registro descartado: reexposição sem reação, erro de cadastro.',
  },
];

/**
 * Tira a alergia da lista ativa sem apagar: fica como inativa ou refutada,
 * com o motivo na auditoria. A receita deixa de alertar sobre ela.
 */
function AllergyStatusSheetContent({
  patientId,
  allergy,
  onClose,
}: {
  patientId: string;
  allergy: PatientAllergy;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<'inactive' | 'refuted'>('inactive');
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/patients/${patientId}/allergies/${allergy.id}`, { status, reason: reason.trim() || undefined }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['patient', patientId] });
      void queryClient.invalidateQueries({ queryKey: ['timeline', patientId] });
      toast.success(`Alergia a ${allergy.substance} retirada da lista ativa.`);
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={`Retirar alergia a ${allergy.substance}`}
      description="A receita deixa de alertar sobre esta substância."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} className="sm:w-auto">
            Voltar
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} className="sm:w-auto">
            Retirar da lista
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div role="radiogroup" aria-label="Situação" className="grid gap-2">
          {OUTCOMES.map((outcome) => {
            const active = status === outcome.status;
            return (
              <button
                key={outcome.status}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setStatus(outcome.status)}
                className={cn(
                  'rounded-[var(--radius)] border px-3 py-2.5 text-left transition-colors',
                  active
                    ? 'border-[var(--brand)] bg-[var(--brand-soft)]'
                    : 'border-[var(--border-strong)] bg-[var(--surface)] hover:bg-[var(--surface-2)]',
                )}
              >
                <span className="block text-[14px] font-medium text-[var(--ink)]">{outcome.title}</span>
                <span className="block text-[12.5px] text-[var(--ink-3)]">{outcome.description}</span>
              </button>
            );
          })}
        </div>
        <Field label="Motivo" hint="Opcional, fica na auditoria.">
          <Input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={300}
            placeholder="Ex.: teste de provocação negativo"
          />
        </Field>
      </div>
    </Sheet>
  );
}

export function AllergyStatusSheet({
  patientId,
  allergy,
  onClose,
}: {
  patientId: string;
  allergy: PatientAllergy | null;
  onClose: () => void;
}) {
  return allergy ? <AllergyStatusSheetContent patientId={patientId} allergy={allergy} onClose={onClose} /> : null;
}
