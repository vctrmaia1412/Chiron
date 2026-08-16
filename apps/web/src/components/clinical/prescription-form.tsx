'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import type { Prescription } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { formatNumber, formatWeight } from '@/lib/format';
import { ROUTE } from '@/lib/labels';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field';
import { MountWhenOpen } from '@/components/ui/mount-when-open';

interface ItemDraft {
  key: string;
  drugName: string;
  activeIngredient: string;
  concentration: string;
  doseValue: string;
  doseUom: 'mg' | 'ml' | 'g' | 'ui' | 'tablet' | 'capsule' | 'drop' | 'sachet' | 'application';
  dosePerKg: boolean;
  route: string;
  frequencyHours: string;
  durationDays: string;
  quantity: string;
  quantityUom: string;
  instructions: string;
  isControlled: boolean;
  withdrawalMeatDays: string;
  withdrawalMilkDays: string;
  extraLabel: boolean;
  extraLabelJustification: string;
}

function emptyItem(): ItemDraft {
  return {
    key: Math.random().toString(36).slice(2),
    drugName: '',
    activeIngredient: '',
    concentration: '',
    doseValue: '',
    doseUom: 'mg',
    dosePerKg: true,
    route: 'oral',
    frequencyHours: '24',
    durationDays: '7',
    quantity: '',
    quantityUom: '',
    instructions: '',
    isControlled: false,
    withdrawalMeatDays: '',
    withdrawalMilkDays: '',
    extraLabel: false,
    extraLabelJustification: '',
  };
}

/**
 * Prescrição com dose calculada pelo peso do paciente em tempo real e checagem
 * de alergia antes de salvar. O cálculo mostrado aqui é o mesmo que o servidor
 * refaz: a regra vive no pacote de domínio, compartilhado pelos dois lados.
 */
function PrescriptionFormSheetContent({
  open,
  onOpenChange,
  encounterId,
  patientId,
  patientName,
  weightKg,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  encounterId?: string;
  patientId: string;
  patientName: string;
  weightKg: string | null;
}) {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<ItemDraft[]>([emptyItem()]);
  const [notes, setNotes] = useState('');

  const weight = weightKg ? Number(weightKg) : null;

  const payloadItems = useMemo(
    () =>
      items
        .filter((item) => item.drugName.trim())
        .map((item) => ({
          drugName: item.drugName.trim(),
          activeIngredient: item.activeIngredient.trim() || undefined,
          concentration: item.concentration.trim() || undefined,
          doseValue: item.doseValue.trim() ? Number(item.doseValue.replace(',', '.')) : undefined,
          doseUom: item.doseValue.trim() ? item.doseUom : undefined,
          dosePerKg: item.dosePerKg,
          route: item.route || undefined,
          frequencyKind: item.frequencyHours ? ('interval_hours' as const) : undefined,
          frequencyValue: item.frequencyHours ? Number(item.frequencyHours) : undefined,
          durationDays: item.durationDays ? Number(item.durationDays) : undefined,
          quantity: item.quantity.trim() ? Number(item.quantity.replace(',', '.')) : undefined,
          quantityUom: item.quantityUom.trim() || undefined,
          instructions: item.instructions.trim() || undefined,
          isControlled: item.isControlled,
          withdrawalMeatDays: item.withdrawalMeatDays ? Number(item.withdrawalMeatDays) : undefined,
          withdrawalMilkDays: item.withdrawalMilkDays ? Number(item.withdrawalMilkDays) : undefined,
          extraLabel: item.extraLabel,
          extraLabelJustification: item.extraLabelJustification.trim() || undefined,
        })),
    [items],
  );

  const allergyCheck = useQuery({
    queryKey: ['allergy-check', patientId, payloadItems.map((item) => item.drugName).join('|')],
    queryFn: () =>
      api.post<{ matches: Array<{ substance: string; matchedOn: string }> }>('/prescriptions/check-allergies', {
        patientId,
        items: payloadItems,
      }),
    enabled: open && payloadItems.length > 0,
  });

  // O alerta vem direto da consulta: nada de copiar para estado e correr o
  // risco de mostrar alergia de um item que já foi removido da receita.
  const allergyMatches = allergyCheck.data?.matches ?? [];

  const mutation = useMutation({
    mutationFn: () =>
      api.post<Prescription>('/prescriptions', {
        patientId,
        encounterId,
        notes: notes.trim() || undefined,
        items: payloadItems,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['prescriptions'] });
      toast.success('Receita criada como rascunho. Assine para gerar o PDF.');
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  function update(key: string, patch: Partial<ItemDraft>) {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Nova receita"
      description={`${patientName}${weight ? ` · ${formatWeight(weight)}` : ' · peso não registrado'}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} className="sm:w-auto">
            Cancelar
          </Button>
          <Button
            onClick={() => {
              if (payloadItems.length === 0) {
                toast.error('Adicione ao menos um medicamento.');
                return;
              }
              mutation.mutate();
            }}
            loading={mutation.isPending}
            className="sm:w-auto"
          >
            Salvar rascunho
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!weight && (
          <div className="flex items-start gap-2 rounded-[var(--radius)] border border-[var(--warning)]/30 bg-[var(--warning-soft)] px-3 py-2.5 text-[13px] text-[var(--warning)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Este paciente não tem peso registrado. Doses por quilo serão recusadas até que o peso seja informado.
            </span>
          </div>
        )}

        {allergyMatches.length > 0 && (
          <div className="rounded-[var(--radius)] border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-2.5">
            <p className="flex items-start gap-2 text-[13.5px] font-semibold text-[var(--danger)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Alergia registrada para este paciente
            </p>
            <ul className="mt-1 space-y-0.5 pl-6 text-[13px] text-[var(--danger)]">
              {allergyMatches.map((match, index) => (
                <li key={`${match.substance}-${index}`}>
                  {match.substance} — item “{match.matchedOn}”
                </li>
              ))}
            </ul>
          </div>
        )}

        {items.map((item, index) => {
          const doseValue = Number(item.doseValue.replace(',', '.'));
          const computed =
            item.dosePerKg && weight && Number.isFinite(doseValue) && doseValue > 0 ? doseValue * weight : null;

          return (
            <div key={item.key} className="rounded-[var(--radius)] border border-[var(--border)] px-3.5 py-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[13px] font-semibold text-[var(--ink-2)]">Item {index + 1}</p>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setItems((current) => current.filter((entry) => entry.key !== item.key))}
                    className="rounded p-1 text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                    aria-label="Remover item"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Medicamento" required>
                    <Input
                      value={item.drugName}
                      onChange={(event) => update(item.key, { drugName: event.target.value })}
                      placeholder="Nome comercial ou genérico"
                    />
                  </Field>
                  <Field label="Princípio ativo" hint="Usado na conferência de alergia.">
                    <Input
                      value={item.activeIngredient}
                      onChange={(event) => update(item.key, { activeIngredient: event.target.value })}
                    />
                  </Field>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Concentração">
                    <Input
                      value={item.concentration}
                      onChange={(event) => update(item.key, { concentration: event.target.value })}
                      placeholder="Ex.: 50 mg/mL"
                    />
                  </Field>
                  <Field label="Dose">
                    <div className="flex gap-2">
                      <Input
                        value={item.doseValue}
                        onChange={(event) => update(item.key, { doseValue: event.target.value })}
                        inputMode="decimal"
                      />
                      <Select
                        value={item.doseUom}
                        onChange={(event) => update(item.key, { doseUom: event.target.value as ItemDraft['doseUom'] })}
                        className="w-24"
                      >
                        <option value="mg">mg</option>
                        <option value="ml">mL</option>
                        <option value="g">g</option>
                        <option value="ui">UI</option>
                        <option value="tablet">comp.</option>
                        <option value="capsule">cáps.</option>
                        <option value="drop">gotas</option>
                        <option value="sachet">sachê</option>
                        <option value="application">aplic.</option>
                      </Select>
                    </div>
                  </Field>
                  <Field label="Via">
                    <Select value={item.route} onChange={(event) => update(item.key, { route: event.target.value })}>
                      {Object.entries(ROUTE).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <Checkbox
                  checked={item.dosePerKg}
                  onChange={(event) => update(item.key, { dosePerKg: event.target.checked })}
                  label="Dose por quilo de peso"
                />

                {item.dosePerKg && (
                  <p
                    className={`rounded-[var(--radius)] px-3 py-2 text-[13px] ${
                      computed
                        ? 'bg-[var(--brand-soft)] text-[var(--brand-ink)]'
                        : 'bg-[var(--surface-2)] text-[var(--ink-3)]'
                    }`}
                  >
                    {computed
                      ? `Dose total: ${formatNumber(computed, 3)} ${item.doseUom} por administração (${item.doseValue} ${item.doseUom}/kg × ${formatWeight(weight)}).`
                      : 'Informe a dose por quilo e registre o peso do paciente para ver a dose total.'}
                  </p>
                )}

                <div className="grid gap-3 sm:grid-cols-4">
                  <Field label="Intervalo (h)">
                    <Input
                      value={item.frequencyHours}
                      onChange={(event) => update(item.key, { frequencyHours: event.target.value })}
                      inputMode="numeric"
                    />
                  </Field>
                  <Field label="Duração (dias)">
                    <Input
                      value={item.durationDays}
                      onChange={(event) => update(item.key, { durationDays: event.target.value })}
                      inputMode="numeric"
                    />
                  </Field>
                  <Field label="Quantidade">
                    <Input
                      value={item.quantity}
                      onChange={(event) => update(item.key, { quantity: event.target.value })}
                      inputMode="decimal"
                    />
                  </Field>
                  <Field label="Unidade">
                    <Input
                      value={item.quantityUom}
                      onChange={(event) => update(item.key, { quantityUom: event.target.value })}
                      placeholder="caixa, frasco"
                    />
                  </Field>
                </div>

                <Field label="Orientações ao tutor">
                  <Textarea
                    value={item.instructions}
                    onChange={(event) => update(item.key, { instructions: event.target.value })}
                    rows={2}
                  />
                </Field>

                <details className="rounded-[var(--radius)] bg-[var(--surface-2)] px-3 py-2">
                  <summary className="cursor-pointer text-[13px] font-medium text-[var(--ink-2)]">
                    Controle especial e animais de produção
                  </summary>
                  <div className="mt-3 space-y-3">
                    <Checkbox
                      checked={item.isControlled}
                      onChange={(event) => update(item.key, { isControlled: event.target.checked })}
                      label="Medicamento de controle especial (receita em duas vias)"
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Carência carne (dias)">
                        <Input
                          value={item.withdrawalMeatDays}
                          onChange={(event) => update(item.key, { withdrawalMeatDays: event.target.value })}
                          inputMode="numeric"
                        />
                      </Field>
                      <Field label="Carência leite (dias)">
                        <Input
                          value={item.withdrawalMilkDays}
                          onChange={(event) => update(item.key, { withdrawalMilkDays: event.target.value })}
                          inputMode="numeric"
                        />
                      </Field>
                    </div>
                    <Checkbox
                      checked={item.extraLabel}
                      onChange={(event) => update(item.key, { extraLabel: event.target.checked })}
                      label="Uso fora de bula (extra-label)"
                    />
                    {item.extraLabel && (
                      <Field label="Justificativa" required>
                        <Textarea
                          value={item.extraLabelJustification}
                          onChange={(event) => update(item.key, { extraLabelJustification: event.target.value })}
                          rows={2}
                        />
                      </Field>
                    )}
                  </div>
                </details>
              </div>
            </div>
          );
        })}

        <Button variant="secondary" block onClick={() => setItems((current) => [...current, emptyItem()])}>
          <Plus className="h-4 w-4" />
          Adicionar medicamento
        </Button>

        <Field label="Observações da receita">
          <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} />
        </Field>
      </div>
    </Sheet>
  );
}

export function PrescriptionFormSheet(props: React.ComponentProps<typeof PrescriptionFormSheetContent>) {
  return (
    <MountWhenOpen open={props.open}>
      <PrescriptionFormSheetContent {...props} />
    </MountWhenOpen>
  );
}
