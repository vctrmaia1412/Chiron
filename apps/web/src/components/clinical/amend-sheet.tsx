'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';

/**
 * Adendo em nota assinada. Não sobrescreve: cria uma nova versão que supersede
 * a anterior, e a anterior continua no prontuário marcada como substituída.
 */
function AmendNoteSheetContent({
  encounterId,
  noteId,
  onClose,
}: {
  encounterId: string;
  noteId: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () => api.post(`/encounters/${encounterId}/notes/${noteId}/amend`, { body: body.trim(), reason: reason.trim() }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['encounter', encounterId] });
      await queryClient.invalidateQueries({ queryKey: ['medical-record'] });
      toast.success('Adendo registrado. A versão anterior continua no prontuário.');
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Sheet
      open={Boolean(noteId)}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Adendo à nota assinada"
      description="A nota original permanece registrada e passa a constar como substituída."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} className="sm:w-auto">
            Cancelar
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={body.trim().length < 3 || reason.trim().length < 3}
            className="sm:w-auto"
          >
            Registrar adendo
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Motivo do adendo" required>
          <Input
            autoFocus
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ex.: informação complementar do tutor"
          />
        </Field>
        <Field label="Texto corrigido" required hint="Escreva a versão completa da seção, não apenas o trecho novo.">
          <Textarea value={body} onChange={(event) => setBody(event.target.value)} rows={6} />
        </Field>
      </div>
    </Sheet>
  );
}

export function AmendNoteSheet(props: React.ComponentProps<typeof AmendNoteSheetContent>) {
  // Cada adendo começa em branco: o componente só existe com uma nota alvo.
  return props.noteId ? <AmendNoteSheetContent {...props} /> : null;
}
