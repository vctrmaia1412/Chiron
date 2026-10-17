'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ban, MoreHorizontal, Pencil } from 'lucide-react';
import type { Immunization, PreventiveTreatment } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatDateTime, toIsoDate } from '@/lib/format';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Field, Input, Textarea } from '@/components/ui/field';
import { PREVENTIVE_KIND_LABEL, refreshImmunizationViews } from './immunization-sheets';

export type AppliedRecord =
  | { type: 'vaccine'; item: Immunization }
  | { type: 'preventive'; item: PreventiveTreatment };

/** Vacinas e preventivos numa linha do tempo só, do mais recente para o mais antigo. */
export function mergeRecords(data?: {
  immunizations: Immunization[];
  preventives: PreventiveTreatment[];
}): AppliedRecord[] {
  if (!data) return [];
  const records: AppliedRecord[] = [
    ...data.immunizations.map((item) => ({ type: 'vaccine' as const, item })),
    ...data.preventives.map((item) => ({ type: 'preventive' as const, item })),
  ];
  return records.sort((a, b) => b.item.administeredAt.localeCompare(a.item.administeredAt));
}

function recordName(record: AppliedRecord): string {
  return record.type === 'vaccine' ? record.item.vaccineName : record.item.productName;
}

function recordPath(record: AppliedRecord): string {
  return record.type === 'vaccine' ? `/immunizations/${record.item.id}` : `/immunizations/preventives/${record.item.id}`;
}

/**
 * Lista de doses aplicadas com "Corrigir" e "Cancelar registro" para quem tem
 * permissão. O registro cancelado continua visível, riscado e com o motivo:
 * é histórico clínico, não some.
 */
export function AppliedRecordList({
  records,
  showPatient = false,
  actions = true,
  className,
}: {
  records: AppliedRecord[];
  /** Na lista geral (página de vacinas) cada linha diz de qual paciente é. */
  showPatient?: boolean;
  /** Desligado onde a lista é só consulta (histórico aberto por cima do atendimento). */
  actions?: boolean;
  className?: string;
}) {
  const { can } = useSession();
  const [correcting, setCorrecting] = useState<AppliedRecord | null>(null);
  const [cancelling, setCancelling] = useState<AppliedRecord | null>(null);
  const canCorrect = actions && can('immunization:update');
  const canCancel = actions && can('immunization:cancel');

  return (
    <>
      <ul className={cn('divide-y divide-[var(--border)]', className)}>
        {records.map((record) => (
          <AppliedRecordRow
            key={`${record.type}-${record.item.id}`}
            record={record}
            showPatient={showPatient}
            onCorrect={canCorrect ? () => setCorrecting(record) : undefined}
            onCancel={canCancel ? () => setCancelling(record) : undefined}
          />
        ))}
      </ul>
      {correcting && (
        <CorrectRecordSheet
          record={correcting}
          onOpenChange={(open) => {
            if (!open) setCorrecting(null);
          }}
        />
      )}
      {cancelling && (
        <CancelRecordSheet
          record={cancelling}
          onOpenChange={(open) => {
            if (!open) setCancelling(null);
          }}
        />
      )}
    </>
  );
}

function AppliedRecordRow({
  record,
  showPatient,
  onCorrect,
  onCancel,
}: {
  record: AppliedRecord;
  showPatient: boolean;
  onCorrect?: () => void;
  onCancel?: () => void;
}) {
  const { item } = record;
  const cancelled = item.status === 'entered_in_error';
  const name = recordName(record);
  const where = item.administeredElsewhere
    ? [item.externalLocation, item.externalProfessional].filter(Boolean).join(', ') || null
    : item.professionalName;
  const details = [
    // Dose de outro local vem da carteira: a hora não significa nada.
    item.administeredElsewhere ? formatDate(item.administeredAt) : formatDateTime(item.administeredAt),
    record.type === 'vaccine' && record.item.doseNumber ? `${record.item.doseNumber}ª dose` : null,
    record.type === 'preventive' ? record.item.doseText : null,
    item.lotNumber ? `lote ${item.lotNumber}` : null,
    where,
  ]
    .filter(Boolean)
    .join(' · ');
  const notes = record.type === 'vaccine' ? record.item.reactionNotes : record.item.notes;
  const hasActions = !cancelled && (onCorrect || onCancel);
  // Item que abre folha: o menu não devolve o foco ao botão "mais", que
  // ficaria atrás do diálogo; quem cuida do foco a partir daí é a folha.
  const openedSheet = useRef(false);

  function openSheet(open?: () => void) {
    openedSheet.current = true;
    open?.();
  }

  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {showPatient && (
              <Link
                href={`/pacientes/${item.patientId}`}
                className="text-[14.5px] font-medium text-[var(--ink)] hover:text-[var(--brand)]"
              >
                {item.patientName ?? 'Paciente'}
              </Link>
            )}
            <span
              className={cn(
                showPatient ? 'text-[13px] text-[var(--ink-2)]' : 'text-[14.5px] font-medium text-[var(--ink)]',
                'min-w-0 break-words',
                cancelled && 'text-[var(--ink-3)] line-through',
              )}
            >
              {name}
            </span>
            {record.type === 'preventive' && <Badge tone="neutral">{PREVENTIVE_KIND_LABEL[record.item.kind]}</Badge>}
            {item.administeredElsewhere && <Badge tone="muted">Outro local</Badge>}
            {cancelled ? (
              <Badge tone="danger">Cancelado</Badge>
            ) : item.nextDueAt ? (
              <Badge tone="info">Próxima {formatDate(item.nextDueAt)}</Badge>
            ) : null}
          </div>
          <p className="break-words text-[12.5px] text-[var(--ink-3)]">{details}</p>
          {cancelled ? (
            item.cancelReason && (
              <p className="mt-0.5 break-words text-[12.5px] text-[var(--danger)]">
                Motivo do cancelamento: {item.cancelReason}
              </p>
            )
          ) : (
            notes && (
              <p
                className={cn(
                  'mt-0.5 whitespace-pre-wrap break-words text-[13px]',
                  record.type === 'vaccine' ? 'text-[var(--warning)]' : 'text-[var(--ink-2)]',
                )}
              >
                {notes}
              </p>
            )
          )}
        </div>
        {hasActions && (
          <DropdownMenu.Root modal={false}>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                aria-label={`Ações do registro de ${name}`}
                className="-mr-2 -mt-1.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius)] text-[var(--ink-3)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
              >
                <MoreHorizontal className="h-5 w-5" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={4}
                onCloseAutoFocus={(event) => {
                  if (!openedSheet.current) return;
                  event.preventDefault();
                  openedSheet.current = false;
                }}
                className="z-50 min-w-[200px] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-lg)]"
              >
                {onCorrect && (
                  <DropdownMenu.Item
                    onSelect={() => openSheet(onCorrect)}
                    className="flex min-h-10 cursor-pointer items-center gap-2 rounded-[calc(var(--radius)-2px)] px-2.5 text-[14px] text-[var(--ink)] outline-none data-[highlighted]:bg-[var(--surface-2)]"
                  >
                    <Pencil className="h-4 w-4 text-[var(--ink-3)]" />
                    Corrigir
                  </DropdownMenu.Item>
                )}
                {onCancel && (
                  <DropdownMenu.Item
                    onSelect={() => openSheet(onCancel)}
                    className="flex min-h-10 cursor-pointer items-center gap-2 rounded-[calc(var(--radius)-2px)] px-2.5 text-[14px] text-[var(--danger)] outline-none data-[highlighted]:bg-[var(--danger-soft)]"
                  >
                    <Ban className="h-4 w-4" />
                    Cancelar registro
                  </DropdownMenu.Item>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}
      </div>
    </li>
  );
}

/** Troca só o dia, mantendo a hora original; nunca passa de agora. */
function moveToDay(originalIso: string, day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  const moved = new Date(originalIso);
  moved.setFullYear(year!, month! - 1, date!);
  const now = new Date();
  return (moved > now ? now : moved).toISOString();
}

/**
 * Correção do que foi digitado errado: data, lote, próxima dose e notas.
 * Só vai ao servidor o que mudou, e o servidor guarda antes e depois na
 * auditoria. Vacina ou produto errado não se corrige aqui: cancela e registra.
 */
function CorrectRecordSheet({
  record,
  onOpenChange,
}: {
  record: AppliedRecord;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { item } = record;
  const vaccine = record.type === 'vaccine' ? record.item : null;
  const preventive = record.type === 'preventive' ? record.item : null;
  const today = toIsoDate(new Date());
  const initial = {
    day: toIsoDate(new Date(item.administeredAt)),
    doseNumber: vaccine?.doseNumber ? String(vaccine.doseNumber) : '',
    doseText: preventive?.doseText ?? '',
    manufacturer: vaccine?.manufacturer ?? '',
    lotNumber: item.lotNumber ?? '',
    expiresAt: vaccine?.expiresAt ?? '',
    nextDueAt: item.nextDueAt ?? '',
    notes: (vaccine ? vaccine.reactionNotes : preventive?.notes) ?? '',
    externalLocation: item.externalLocation ?? '',
    externalProfessional: item.externalProfessional ?? '',
  };
  const [form, setForm] = useState(initial);

  function set<K extends keyof typeof initial>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  /** Só o que mudou; texto apagado vai como `null` para limpar o campo. */
  function changes(): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    const text = (key: keyof typeof initial, field: string) => {
      if (form[key].trim() !== initial[key].trim()) payload[field] = form[key].trim() || null;
    };
    if (form.day !== initial.day) payload.administeredAt = moveToDay(item.administeredAt, form.day);
    text('lotNumber', 'lotNumber');
    if (form.nextDueAt !== initial.nextDueAt) payload.nextDueAt = form.nextDueAt || null;
    if (vaccine) {
      if (form.doseNumber.trim() !== initial.doseNumber) {
        payload.doseNumber = form.doseNumber.trim() ? Number(form.doseNumber.trim()) : null;
      }
      text('manufacturer', 'manufacturer');
      if (form.expiresAt !== initial.expiresAt) payload.expiresAt = form.expiresAt || null;
      text('notes', 'reactionNotes');
    } else {
      text('doseText', 'doseText');
      text('notes', 'notes');
    }
    if (item.administeredElsewhere) {
      text('externalLocation', 'externalLocation');
      text('externalProfessional', 'externalProfessional');
    }
    return payload;
  }

  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.patch(recordPath(record), payload),
    onSuccess: async () => {
      await refreshImmunizationViews(queryClient, item.patientId);
      toast.success('Registro corrigido. O valor anterior fica na auditoria.');
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  function submit() {
    if (!form.day || form.day > today) {
      toast.error('Informe uma data de aplicação até hoje.');
      return;
    }
    if (form.doseNumber.trim() && !/^\d{1,2}$/.test(form.doseNumber.trim())) {
      toast.error('Dose nº deve ser um número, como 1, 2 ou 3.');
      return;
    }
    const payload = changes();
    if (Object.keys(payload).length === 0) {
      onOpenChange(false);
      return;
    }
    mutation.mutate(payload);
  }

  return (
    <Sheet
      open
      onOpenChange={onOpenChange}
      title="Corrigir registro"
      description={`${recordName(record)}${item.patientName ? ` · ${item.patientName}` : ''}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} className="sm:w-auto">
            Voltar
          </Button>
          <Button onClick={submit} loading={mutation.isPending} className="sm:w-auto">
            Salvar correção
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Aplicada em" required>
            <Input type="date" max={today} value={form.day} onChange={(event) => set('day', event.target.value)} />
          </Field>
          {vaccine ? (
            <Field label="Dose nº">
              <Input
                inputMode="numeric"
                value={form.doseNumber}
                onChange={(event) => set('doseNumber', event.target.value)}
              />
            </Field>
          ) : (
            <Field label="Dose">
              <Input value={form.doseText} onChange={(event) => set('doseText', event.target.value)} />
            </Field>
          )}
        </div>
        <Field label={vaccine ? 'Próxima dose' : 'Próxima aplicação'} hint="Apague a data se não houver próxima.">
          <Input type="date" value={form.nextDueAt} onChange={(event) => set('nextDueAt', event.target.value)} />
        </Field>
        {vaccine ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Fabricante" className="col-span-2 sm:col-span-1">
              <Input value={form.manufacturer} onChange={(event) => set('manufacturer', event.target.value)} />
            </Field>
            <Field label="Lote">
              <Input value={form.lotNumber} onChange={(event) => set('lotNumber', event.target.value)} />
            </Field>
            <Field label="Validade">
              <Input type="date" value={form.expiresAt} onChange={(event) => set('expiresAt', event.target.value)} />
            </Field>
          </div>
        ) : (
          <Field label="Lote">
            <Input value={form.lotNumber} onChange={(event) => set('lotNumber', event.target.value)} />
          </Field>
        )}
        {item.administeredElsewhere && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Onde foi aplicada">
              <Input value={form.externalLocation} onChange={(event) => set('externalLocation', event.target.value)} />
            </Field>
            <Field label="Aplicada por">
              <Input
                value={form.externalProfessional}
                onChange={(event) => set('externalProfessional', event.target.value)}
              />
            </Field>
          </div>
        )}
        <Field label={vaccine ? 'Reação observada' : 'Observações'}>
          <Textarea value={form.notes} onChange={(event) => set('notes', event.target.value)} rows={2} />
        </Field>
        <p className="text-[12.5px] text-[var(--ink-3)]">
          {vaccine ? 'Vacina errada' : 'Produto errado'} não se corrige: cancele este registro e registre de novo.
        </p>
      </div>
    </Sheet>
  );
}

const QUICK_REASONS = [
  'Registrado no paciente errado',
  'Registro duplicado',
  'Dose não foi aplicada',
  'Produto registrado errado',
];

/** Cancelar é marcar como erro, com motivo: some das pendências e da carteira, fica no histórico. */
function CancelRecordSheet({
  record,
  onOpenChange,
}: {
  record: AppliedRecord;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { item } = record;
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () => api.post(`${recordPath(record)}/cancel`, { reason: reason.trim() }),
    onSuccess: async () => {
      await refreshImmunizationViews(queryClient, item.patientId);
      toast.success('Registro cancelado. Ele saiu das pendências e continua no histórico.');
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  function submit() {
    if (reason.trim().length < 3) {
      toast.error('Informe o motivo do cancelamento.');
      return;
    }
    mutation.mutate();
  }

  return (
    <Sheet
      open
      onOpenChange={onOpenChange}
      title="Cancelar registro"
      description={`${recordName(record)} · ${
        item.administeredElsewhere ? formatDate(item.administeredAt) : formatDateTime(item.administeredAt)
      }${item.patientName ? ` · ${item.patientName}` : ''}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} className="sm:w-auto">
            Voltar
          </Button>
          <Button variant="danger" onClick={submit} loading={mutation.isPending} className="sm:w-auto">
            Cancelar registro
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[13.5px] text-[var(--ink-2)]">
          O registro não é apagado: fica no histórico marcado como cancelado, com o motivo, e deixa de gerar
          lembrete de próxima dose.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_REASONS.map((quick) => (
            <button
              key={quick}
              type="button"
              aria-pressed={reason === quick}
              onClick={() => setReason(quick)}
              className={cn(
                'min-h-10 rounded-full border px-3 text-[13px] font-medium transition-colors',
                reason === quick
                  ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-ink)]'
                  : 'border-[var(--border-strong)] text-[var(--ink-2)] hover:bg-[var(--surface-2)]',
              )}
            >
              {quick}
            </button>
          ))}
        </div>
        <Field label="Motivo" required>
          <Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} maxLength={300} />
        </Field>
      </div>
    </Sheet>
  );
}
