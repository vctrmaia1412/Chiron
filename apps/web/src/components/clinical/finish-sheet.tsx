'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, MessageCircle } from 'lucide-react';
import { recordCompleteness } from '@chiron/domain';
import type { EncounterDetail } from '@chiron/contracts';
import { ApiError, api, errorMessage } from '@/lib/api';
import { addDays, formatDate, toIsoDate, whatsappLink } from '@/lib/format';
import { useSession } from '@/lib/session';
import { NOTE_KIND, labelFor } from '@/lib/labels';
import { cn } from '@/lib/cn';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { MountWhenOpen } from '@/components/ui/mount-when-open';

const FOLLOW_UP_DAYS = [7, 15, 30] as const;

/** Mensagem para o tutor com o que importa depois da consulta: o que fazer e quando voltar. */
function guardianMessage({
  guardianName,
  patientName,
  plan,
  followUp,
  clinicName,
}: {
  guardianName: string | null;
  patientName: string;
  plan: string | null;
  followUp: { date: string; reason: string } | null;
  clinicName: string | null;
}): string {
  const firstName = guardianName?.split(' ')[0];
  const lines = [
    `Olá${firstName ? `, ${firstName}` : ''}! Seguem as orientações do atendimento de ${patientName} hoje (${formatDate(new Date())}).`,
    plan?.trim() ? `\n${plan.trim()}` : null,
    followUp ? `\nRetorno: ${formatDate(followUp.date)}${followUp.reason ? ` (${followUp.reason})` : ''}.` : null,
    '\nQualquer dúvida, estamos à disposição.',
    clinicName ? clinicName : null,
  ];
  return lines.filter(Boolean).join('\n');
}

/**
 * Finalizar assina as notas em rascunho e sela o atendimento com hash de
 * integridade. O retorno é um toque (7, 15 ou 30 dias), o mínimo do prontuário
 * aparece como lembrete e não como trava, e ao final a orientação ao tutor sai
 * pronta para o WhatsApp. Se faltar o conteúdo mínimo do tipo de serviço, o
 * servidor recusa e a tela pede a justificativa, que também fica gravada.
 */
function FinishEncounterSheetContent({
  open,
  onOpenChange,
  encounter,
  guardianPhone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  encounter: EncounterDetail;
  guardianPhone?: string | null;
}) {
  const queryClient = useQueryClient();
  const { context } = useSession();
  const [disposition, setDisposition] = useState<'discharged' | 'referred' | 'admitted' | 'transferred'>('discharged');
  const [followUpDays, setFollowUpDays] = useState<number | null>(null);
  const [followUpDueAt, setFollowUpDueAt] = useState('');
  const [followUpReason, setFollowUpReason] = useState('Reavaliação clínica');
  const [referralTo, setReferralTo] = useState('');
  const [referralReason, setReferralReason] = useState('');
  const [justification, setJustification] = useState('');
  const [needsJustification, setNeedsJustification] = useState(false);
  const [minimumMessage, setMinimumMessage] = useState('');
  const [finished, setFinished] = useState<EncounterDetail | null>(null);

  const wantsFollowUp = followUpDays !== null || Boolean(followUpDueAt);
  const followUpDate = followUpDueAt || (followUpDays ? toIsoDate(addDays(new Date(), followUpDays)) : '');

  const completeness = recordCompleteness({
    noteKinds: encounter.notes.map((note) => ({ kind: note.kind, body: note.body })),
    observationCount: encounter.observations.length,
    diagnosisCount: encounter.diagnoses.length,
  });
  const missing = completeness.filter((item) => !item.done);
  // Lacuna "__" de modelo esquecida vai para o registro assinado se ninguém avisar.
  const withGaps = encounter.notes
    .filter((note) => note.status === 'draft' && note.body.includes('__'))
    .map((note) => labelFor(NOTE_KIND, note.kind).toLowerCase());

  const mutation = useMutation({
    mutationFn: () =>
      api.post<EncounterDetail>(`/encounters/${encounter.id}/finish`, {
        disposition,
        followUpDueAt: wantsFollowUp ? followUpDate : undefined,
        followUpReason: wantsFollowUp ? followUpReason.trim() || undefined : undefined,
        referral:
          disposition === 'referred' && referralTo.trim()
            ? { to: referralTo.trim(), reason: referralReason.trim() || 'Encaminhamento' }
            : undefined,
        expectedVersion: encounter.version,
        minimumContentJustification: needsJustification ? justification.trim() || undefined : undefined,
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['encounter', encounter.id] });
      await queryClient.invalidateQueries({ queryKey: ['encounters'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      await queryClient.invalidateQueries({ queryKey: ['medical-record', encounter.patient.id] });
      await queryClient.invalidateQueries({ queryKey: ['patient-summary', encounter.patient.id] });
      toast.success('Atendimento finalizado e assinado.');
      setFinished(result);
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

  if (finished) {
    const plan = finished.notes.find((note) => note.kind === 'plan' && !note.supersededByNoteId)?.body ?? null;
    const message = guardianMessage({
      guardianName: finished.guardianName,
      patientName: finished.patient.name,
      plan,
      followUp: finished.followUpDueAt
        ? { date: finished.followUpDueAt, reason: finished.followUpReason ?? '' }
        : null,
      clinicName: context?.tenant?.name ?? null,
    });
    const link = whatsappLink(guardianPhone, message);

    return (
      <Sheet open={open} onOpenChange={onOpenChange} title="Atendimento finalizado" size="md">
        <div className="space-y-4">
          <p className="flex items-start gap-2 rounded-[var(--radius)] bg-[var(--success-soft)] px-3 py-2.5 text-[13.5px] text-[var(--success)]">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            Notas assinadas e registro selado.
            {finished.followUpDueAt ? ` Retorno indicado para ${formatDate(finished.followUpDueAt)}.` : ''}
          </p>

          {link ? (
            <div className="space-y-2">
              <p className="text-[13px] font-medium text-[var(--ink-2)]">Mensagem para o tutor</p>
              <p className="whitespace-pre-wrap rounded-[var(--radius)] bg-[var(--surface-2)] px-3 py-2.5 text-[13px] text-[var(--ink-2)]">
                {message}
              </p>
              <Button asChild block>
                <a href={link} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-4 w-4" />
                  Enviar orientações pelo WhatsApp
                </a>
              </Button>
            </div>
          ) : (
            <p className="text-[13px] text-[var(--ink-3)]">
              O tutor não tem telefone cadastrado. Cadastre para enviar as orientações pelo WhatsApp.
            </p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild variant="secondary" className="sm:flex-1">
              <Link href={`/pacientes/${finished.patient.id}/prontuario`}>Ver prontuário</Link>
            </Button>
            <Button variant="ghost" onClick={() => onOpenChange(false)} className="sm:flex-1">
              Fechar
            </Button>
          </div>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Finalizar atendimento"
      description="As notas são assinadas e passam a mudar só por adendo, com a versão anterior visível."
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
        {needsJustification ? (
          <div className="rounded-[var(--radius)] border border-[var(--warning)]/30 bg-[var(--warning-soft)] px-3 py-3">
            <p className="flex items-start gap-2 text-[13.5px] font-medium text-[var(--warning)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {minimumMessage}
            </p>
            <div className="mt-3">
              <Field label="Justificativa" required hint="Fica registrada no atendimento e na auditoria." htmlFor="finish-justification">
                <Textarea
                  id="finish-justification"
                  autoFocus
                  value={justification}
                  onChange={(event) => setJustification(event.target.value)}
                  rows={3}
                  placeholder="Ex.: tutor desistiu do atendimento antes da avaliação."
                />
              </Field>
            </div>
          </div>
        ) : (
          missing.length > 0 && (
            <p className="rounded-[var(--radius)] bg-[var(--surface-2)] px-3 py-2.5 text-[13px] text-[var(--ink-2)]">
              Ainda sem: <strong>{missing.map((item) => item.label.toLowerCase()).join(', ')}</strong>. Dá para finalizar
              mesmo assim; vale completar se for rápido.
            </p>
          )
        )}

        {withGaps.length > 0 && (
          <p className="flex items-start gap-2 rounded-[var(--radius)] border border-[var(--warning)]/30 bg-[var(--warning-soft)] px-3 py-2.5 text-[13px] text-[var(--warning)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Há lacunas &quot;__&quot; do modelo sem preencher em <strong>{withGaps.join(', ')}</strong>. Volte e
              complete, ou apague o que não se aplica, antes de assinar.
            </span>
          </p>
        )}

        <div>
          <p className="mb-1.5 text-[13px] font-medium text-[var(--ink-2)]">Retorno</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              aria-pressed={!wantsFollowUp}
              onClick={() => {
                setFollowUpDays(null);
                setFollowUpDueAt('');
              }}
              className={cn(
                'h-9 rounded-full border px-3 text-[13px] font-medium',
                !wantsFollowUp
                  ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-ink)]'
                  : 'border-[var(--border-strong)] text-[var(--ink-2)]',
              )}
            >
              Sem retorno
            </button>
            {FOLLOW_UP_DAYS.map((days) => (
              <button
                key={days}
                type="button"
                aria-pressed={followUpDays === days && !followUpDueAt}
                onClick={() => {
                  setFollowUpDays(days);
                  setFollowUpDueAt('');
                }}
                className={cn(
                  'h-9 rounded-full border px-3 text-[13px] font-medium',
                  followUpDays === days && !followUpDueAt
                    ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-ink)]'
                    : 'border-[var(--border-strong)] text-[var(--ink-2)]',
                )}
              >
                {days} dias
              </button>
            ))}
            <Input
              type="date"
              aria-label="Outra data de retorno"
              value={followUpDueAt}
              onChange={(event) => setFollowUpDueAt(event.target.value)}
              className="h-9 w-auto md:h-9"
            />
          </div>
          {wantsFollowUp && (
            <div className="mt-2">
              <Input
                aria-label="Motivo do retorno"
                value={followUpReason}
                onChange={(event) => setFollowUpReason(event.target.value)}
                placeholder="Motivo do retorno"
              />
              <p className="mt-1 text-[12.5px] text-[var(--ink-3)]">
                {formatDate(followUpDate)}: entra na lista de retornos a agendar.
              </p>
            </div>
          )}
        </div>

        <Field label="Desfecho" htmlFor="finish-disposition">
          <Select
            id="finish-disposition"
            value={disposition}
            onChange={(event) => setDisposition(event.target.value as typeof disposition)}
          >
            <option value="discharged">Alta</option>
            <option value="referred">Encaminhado</option>
            <option value="admitted">Internado</option>
            <option value="transferred">Transferido</option>
          </Select>
        </Field>

        {disposition === 'referred' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Encaminhado para" required htmlFor="finish-referral-to">
              <Input
                id="finish-referral-to"
                value={referralTo}
                onChange={(event) => setReferralTo(event.target.value)}
                placeholder="Especialidade ou serviço"
              />
            </Field>
            <Field label="Motivo" htmlFor="finish-referral-reason">
              <Input
                id="finish-referral-reason"
                value={referralReason}
                onChange={(event) => setReferralReason(event.target.value)}
              />
            </Field>
          </div>
        )}
      </div>
    </Sheet>
  );
}

export function FinishEncounterSheet(props: React.ComponentProps<typeof FinishEncounterSheetContent>) {
  return (
    <MountWhenOpen open={props.open}>
      <FinishEncounterSheetContent {...props} />
    </MountWhenOpen>
  );
}
