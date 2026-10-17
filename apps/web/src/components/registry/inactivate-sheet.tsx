'use client';

import { useState } from 'react';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Field, Select, Textarea } from '@/components/ui/field';
import { MountWhenOpen } from '@/components/ui/mount-when-open';

export interface InactivationReason {
  label: string;
  /** Paciente que foi para outra clínica fica "transferido", não "inativo". */
  transferred?: boolean;
}

const OTHER = 'Outro motivo';

/**
 * Inativar cadastro (paciente ou tutor): motivo de um toque e detalhe
 * opcional. O motivo vai para a ficha e para a auditoria.
 */
function InactivateSheetContent({
  open,
  onOpenChange,
  title,
  description,
  reasons,
  note,
  loading,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  reasons: InactivationReason[];
  /** O que muda (e o que não muda) depois de inativar. */
  note: React.ReactNode;
  loading?: boolean;
  onConfirm: (input: { reason: string; transferred: boolean }) => void;
}) {
  const [choice, setChoice] = useState(reasons[0]?.label ?? OTHER);
  const [detail, setDetail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const isOther = choice === OTHER;

  function submit() {
    const text = detail.trim();
    if (isOther && text.length < 2) {
      setError('Descreva o motivo.');
      return;
    }
    const reason = isOther ? text : text ? `${choice}: ${text}` : choice;
    const selected = reasons.find((item) => item.label === choice);
    onConfirm({ reason: reason.slice(0, 300), transferred: Boolean(selected?.transferred) });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} className="sm:w-auto">
            Voltar
          </Button>
          <Button variant="danger" onClick={submit} loading={loading} className="sm:w-auto">
            Inativar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Motivo" required>
          <Select
            value={choice}
            onChange={(event) => {
              setChoice(event.target.value);
              setError(null);
            }}
          >
            {reasons.map((item) => (
              <option key={item.label} value={item.label}>
                {item.label}
              </option>
            ))}
            <option value={OTHER}>{OTHER}</option>
          </Select>
        </Field>

        <Field label={isOther ? 'Qual motivo?' : 'Detalhe'} required={isOther} error={error}>
          <Textarea
            value={detail}
            onChange={(event) => setDetail(event.target.value)}
            rows={2}
            maxLength={250}
            placeholder={isOther ? 'Descreva em poucas palavras' : 'Opcional'}
          />
        </Field>

        <div className="rounded-[var(--radius)] bg-[var(--surface-2)] px-3 py-2 text-[12.5px] text-[var(--ink-3)]">
          {note}
        </div>
      </div>
    </Sheet>
  );
}

export function InactivateSheet(props: React.ComponentProps<typeof InactivateSheetContent>) {
  return (
    <MountWhenOpen open={props.open}>
      <InactivateSheetContent {...props} />
    </MountWhenOpen>
  );
}
