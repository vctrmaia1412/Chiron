'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import type { EncounterDetail } from '@chiron/contracts';
import { ApiError, api, errorMessage } from '@/lib/api';
import { addDays, toIsoDate } from '@/lib/format';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field';

/**
 * Finalizar assina as notas em rascunho e sela o atendimento com hash de
 * integridade. Se faltar conteúdo mínimo para o tipo de serviço, o servidor
 * recusa e a tela oferece a justificativa explícita, que também fica gravada.
 */
export function FinishEncounterSheet({
  open,
  onOpenChange,
  encounter,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  encounter: EncounterDetail;
}) {
  const queryClient = useQueryClient();
  const [disposition, setDisposition] = useState<'discharged' | 'referred' | 'admitted' | 'transferred'>('discharged');
  const [wantsFollowUp, setWantsFollowUp] = useState(false);
  const [followUpDueAt, setFollowUpDueAt] = useState(toIsoDate(addDays(new Date(), 15)));
  const [followUpReason, setFollowUpReason] = useState('Reavaliação clínica');
  const [referralTo, setReferralTo] = useState('');
  const [referralReason, setReferralReason] = useState('');
  const [justification, setJustification] = useState('');
  const [needsJustification, setNeedsJustification] = useState(false);
  const [minimumMessage, setMinimumMessage] = useState('');

  useEffect(() => {
    if (!open) return;
    setDisposition('discharged');
    setWantsFollowUp(false);
    setFollowUpDueAt(toIsoDate(addDays(new Date(), 15)));
    setFollowUpReason('Reavaliação clínica');
    setReferralTo('');
    setReferralReason('');
    setJustification('');
    setNeedsJustification(false);
    setMinimumMessage('');
  }, [open]);

  const mutation = useMutation({
    mutationFn: () =>
      api.post<EncounterDetail>(`/encounters/${encounter.id}/finish`, {
        disposition,
        followUpDueAt: wantsFollowUp ? followUpDueAt : undefined,
        followUpReason: wantsFollowUp ? followUpReason.trim() || undefined : undefined,
        referral:
          disposition === 'referred' && referralTo.trim()
            ? { to: referralTo.trim(), reason: referralReason.trim() || 'Encaminhamento' }
            : undefined,
        expectedVersion: encounter.version,
        minimumContentJustification: needsJustification ? justification.trim() || undefined : undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['encounter', encounter.id] });
      await queryClient.invalidateQueries({ queryKey: ['encounters'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      await queryClient.invalidateQueries({ queryKey: ['medical-record', encounter.patient.id] });
      toast.success('Atendimento finalizado. Notas assinadas.');
      onOpenChange(false);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'MINIMUM_CONTENT_REQUIRED') {
        setNeedsJustification(true);
        setMinimumMessage(error.message);
        return;
      }
      toast.error(errorMessage(error));
    },
  });

  const draftCount = encounter.notes.filter((note) => note.status === 'draft' && note.body.trim()).length;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Finalizar atendimento"
      description={
        draftCount > 0
          ? `${draftCount} ${draftCount === 1 ? 'nota será assinada' : 'notas serão assinadas'} e deixarão de ser editáveis.`
          : 'As notas registradas serão assinadas e deixarão de ser editáveis.'
      }
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} className="sm:w-auto">
            Voltar
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={needsJustification && justification.trim().length < 5}
            className="sm:w-auto"
          >
            Finalizar e assinar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {needsJustification && (
          <div className="rounded-[var(--radius)] border border-[var(--warning)]/30 bg-[var(--warning-soft)] px-3 py-3">
            <p className="flex items-start gap-2 text-[13.5px] font-medium text-[var(--warning)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {minimumMessage}
            </p>
            <div className="mt-3">
              <Field label="Justificativa" required hint="Fica registrada no atendimento e na auditoria.">
                <Textarea
                  autoFocus
                  value={justification}
                  onChange={(event) => setJustification(event.target.value)}
                  rows={3}
                  placeholder="Ex.: tutor desistiu do atendimento antes da avaliação."
                />
              </Field>
            </div>
          </div>
        )}

        <Field label="Desfecho">
          <Select value={disposition} onChange={(event) => setDisposition(event.target.value as typeof disposition)}>
            <option value="discharged">Alta</option>
            <option value="referred">Encaminhado</option>
            <option value="admitted">Internado</option>
            <option value="transferred">Transferido</option>
          </Select>
        </Field>

        {disposition === 'referred' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Encaminhado para" required>
              <Input
                value={referralTo}
                onChange={(event) => setReferralTo(event.target.value)}
                placeholder="Especialidade ou serviço"
              />
            </Field>
            <Field label="Motivo">
              <Input value={referralReason} onChange={(event) => setReferralReason(event.target.value)} />
            </Field>
          </div>
        )}

        <Checkbox
          checked={wantsFollowUp}
          onChange={(event) => setWantsFollowUp(event.target.checked)}
          label="Indicar retorno"
        />

        {wantsFollowUp && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Data prevista">
              <Input type="date" value={followUpDueAt} onChange={(event) => setFollowUpDueAt(event.target.value)} />
            </Field>
            <Field label="Motivo do retorno">
              <Input value={followUpReason} onChange={(event) => setFollowUpReason(event.target.value)} />
            </Field>
          </div>
        )}

        <p className="rounded-[var(--radius)] bg-[var(--surface-2)] px-3 py-2 text-[12.5px] text-[var(--ink-3)]">
          Depois de finalizado, o registro só muda por adendo, e a versão anterior continua visível no prontuário.
        </p>
      </div>
    </Sheet>
  );
}
