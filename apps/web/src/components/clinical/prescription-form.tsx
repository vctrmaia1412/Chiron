'use client';

import { useMemo, useState } from 'react';
import { useDebounced } from '@/lib/use-debounced';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, BookmarkPlus, ChevronDown, Info, Plus, Trash2 } from 'lucide-react';
import type { MedicationSuggestion, Prescription, PrescriptionItemInput } from '@chiron/contracts';
import { api, errorMessage } from '@/lib/api';
import { useMedicationSuggestions } from '@/lib/charting';
import { formatNumber, formatWeight } from '@/lib/format';
import { ROUTE } from '@/lib/labels';
import { cn } from '@/lib/cn';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field';
import { MountWhenOpen } from '@/components/ui/mount-when-open';

type DoseUom = 'mg' | 'ml' | 'g' | 'ui' | 'tablet' | 'capsule' | 'drop' | 'sachet' | 'application';
type Frequency = { kind: 'interval_hours'; hours: string } | { kind: 'once' } | { kind: 'prn' };

interface ItemDraft {
  key: string;
  drugName: string;
  activeIngredient: string;
  concentration: string;
  doseValue: string;
  doseUom: DoseUom;
  dosePerKg: boolean;
  route: string;
  frequency: Frequency;
  durationDays: string;
  continuous: boolean;
  quantity: string;
  quantityUom: string;
  instructions: string;
  isControlled: boolean;
  withdrawalMeatDays: string;
  withdrawalMilkDays: string;
  extraLabel: boolean;
  extraLabelJustification: string;
  showDetails: boolean;
}

const DOSE_UOM: Record<DoseUom, string> = {
  mg: 'mg',
  ml: 'mL',
  g: 'g',
  ui: 'UI',
  tablet: 'comp.',
  capsule: 'cáps.',
  drop: 'gotas',
  sachet: 'sachê',
  application: 'aplic.',
};

const CONTINUOUS = 'Uso contínuo.';

let sequence = 0;
function nextKey() {
  sequence += 1;
  return `item-${sequence}`;
}

function emptyItem(): ItemDraft {
  return {
    key: nextKey(),
    drugName: '',
    activeIngredient: '',
    concentration: '',
    doseValue: '',
    doseUom: 'mg',
    dosePerKg: true,
    route: 'oral',
    frequency: { kind: 'interval_hours', hours: '12' },
    durationDays: '7',
    continuous: false,
    quantity: '',
    quantityUom: '',
    instructions: '',
    isControlled: false,
    withdrawalMeatDays: '',
    withdrawalMilkDays: '',
    extraLabel: false,
    extraLabelJustification: '',
    showDetails: false,
  };
}

function text(value: string | number | null | undefined): string {
  if (value == null) return '';
  return String(value).replace('.', ',');
}

/** Item já prescrito (sugestão, receita anterior ou protocolo) virando rascunho editável. */
export function draftFromItem(item: Partial<PrescriptionItemInput> & { drugName: string }): ItemDraft {
  const base = emptyItem();
  const instructions = item.instructions ?? '';
  const continuous = !item.durationDays && instructions.toLowerCase().startsWith('uso contínuo');
  const frequency: Frequency =
    item.frequencyKind === 'once'
      ? { kind: 'once' }
      : item.frequencyKind === 'prn'
        ? { kind: 'prn' }
        : { kind: 'interval_hours', hours: text(item.frequencyValue) || '12' };
  const details =
    Boolean(item.isControlled || item.extraLabel || item.withdrawalMeatDays || item.withdrawalMilkDays) ||
    Boolean(item.quantity);
  return {
    ...base,
    drugName: item.drugName,
    activeIngredient: item.activeIngredient ?? '',
    concentration: item.concentration ?? '',
    doseValue: text(item.doseValue),
    doseUom: (item.doseUom as DoseUom) ?? base.doseUom,
    dosePerKg: item.dosePerKg ?? false,
    route: item.route ?? base.route,
    frequency,
    durationDays: continuous ? '' : text(item.durationDays),
    continuous,
    quantity: text(item.quantity),
    quantityUom: item.quantityUom ?? '',
    instructions: continuous ? instructions.slice(CONTINUOUS.length).trim() : instructions,
    isControlled: item.isControlled ?? false,
    withdrawalMeatDays: text(item.withdrawalMeatDays),
    withdrawalMilkDays: text(item.withdrawalMilkDays),
    extraLabel: item.extraLabel ?? false,
    extraLabelJustification: item.extraLabelJustification ?? '',
    showDetails: details,
  };
}

function fromSuggestion(suggestion: MedicationSuggestion, key: string): ItemDraft {
  return {
    ...draftFromItem({
      drugName: suggestion.drugName,
      activeIngredient: suggestion.activeIngredient ?? undefined,
      concentration: suggestion.concentration ?? undefined,
      doseValue: suggestion.doseValue ? Number(suggestion.doseValue) : undefined,
      doseUom: suggestion.doseUom ?? undefined,
      dosePerKg: suggestion.dosePerKg,
      route: suggestion.route ?? undefined,
      frequencyKind: suggestion.frequencyKind ?? undefined,
      frequencyValue: suggestion.frequencyValue ? Number(suggestion.frequencyValue) : undefined,
      durationDays: suggestion.durationDays ?? undefined,
      quantityUom: suggestion.quantityUom ?? undefined,
      instructions: suggestion.instructions ?? undefined,
      isControlled: suggestion.isControlled,
      withdrawalMeatDays: suggestion.withdrawalMeatDays ?? undefined,
      withdrawalMilkDays: suggestion.withdrawalMilkDays ?? undefined,
    }),
    key,
  };
}

function toNumber(value: string): number | undefined {
  const parsed = Number(value.replace(',', '.'));
  return value.trim() && Number.isFinite(parsed) ? parsed : undefined;
}

export function payloadFromDraft(item: ItemDraft): PrescriptionItemInput {
  const instructions = [item.continuous ? CONTINUOUS : '', item.instructions.trim()].filter(Boolean).join(' ');
  return {
    drugName: item.drugName.trim(),
    activeIngredient: item.activeIngredient.trim() || undefined,
    concentration: item.concentration.trim() || undefined,
    doseValue: toNumber(item.doseValue),
    doseUom: item.doseValue.trim() ? item.doseUom : undefined,
    dosePerKg: item.dosePerKg,
    route: (item.route || undefined) as PrescriptionItemInput['route'],
    frequencyKind: item.frequency.kind,
    frequencyValue: item.frequency.kind === 'interval_hours' ? toNumber(item.frequency.hours) : undefined,
    durationDays: item.continuous ? undefined : toNumber(item.durationDays),
    quantity: toNumber(item.quantity),
    quantityUom: item.quantityUom.trim() || undefined,
    instructions: instructions || undefined,
    isControlled: item.isControlled,
    withdrawalMeatDays: toNumber(item.withdrawalMeatDays),
    withdrawalMilkDays: toNumber(item.withdrawalMilkDays),
    extraLabel: item.extraLabel,
    extraLabelJustification: item.extraLabelJustification.trim() || undefined,
  };
}

function posologyPreview(item: ItemDraft, weight: number | null): string {
  const dose = toNumber(item.doseValue);
  const unit = DOSE_UOM[item.doseUom];
  const total = item.dosePerKg && dose && weight ? dose * weight : null;
  const parts = [
    dose ? (item.dosePerKg ? `${text(dose)} ${unit}/kg${total ? ` (${formatNumber(total, 2)} ${unit})` : ''}` : `${text(dose)} ${unit}`) : null,
    item.route ? ROUTE[item.route]?.toLowerCase() : null,
    item.frequency.kind === 'interval_hours'
      ? item.frequency.hours
        ? `a cada ${item.frequency.hours} h`
        : null
      : item.frequency.kind === 'once'
        ? 'dose única'
        : 'se necessário',
    item.continuous ? 'uso contínuo' : item.durationDays ? `por ${item.durationDays} dias` : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'h-9 rounded-full border px-3 text-[13px] font-medium transition-colors',
        active
          ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-ink)]'
          : 'border-[var(--border-strong)] text-[var(--ink-2)] hover:bg-[var(--surface-2)]',
      )}
    >
      {children}
    </button>
  );
}

/** Nome do medicamento com o que a clínica já prescreveu, posologia inclusa. */
function DrugNameInput({
  id,
  value,
  speciesId,
  onChange,
  onPick,
}: {
  id: string;
  value: string;
  speciesId: string | null;
  onChange: (value: string) => void;
  onPick: (suggestion: MedicationSuggestion) => void;
}) {
  const [focused, setFocused] = useState(false);
  const deferred = useDebounced(value.trim(), 250);
  const { data: suggestions = [] } = useMedicationSuggestions(focused ? deferred : '', speciesId);
  const visible = focused && deferred.length >= 2 && suggestions.length > 0;

  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder="Comece a digitar o nome"
      />
      {visible && (
        <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] py-1 shadow-[var(--shadow-lg)]">
          {suggestions.map((suggestion) => (
            <li key={suggestion.drugName}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onPick(suggestion);
                  setFocused(false);
                }}
                className="w-full px-3 py-2 text-left hover:bg-[var(--surface-2)]"
              >
                <span className="block text-[14px] font-medium text-[var(--ink)]">{suggestion.drugName}</span>
                <span className="block truncate text-[12px] text-[var(--ink-3)]">
                  {[
                    suggestion.doseValue
                      ? `${text(suggestion.doseValue)} ${suggestion.doseUom ? DOSE_UOM[suggestion.doseUom as DoseUom] : ''}${suggestion.dosePerKg ? '/kg' : ''}`
                      : null,
                    suggestion.frequencyKind === 'interval_hours' && suggestion.frequencyValue
                      ? `a cada ${text(suggestion.frequencyValue)} h`
                      : null,
                    suggestion.durationDays ? `${suggestion.durationDays} dias` : null,
                    `usado ${suggestion.timesUsed}x${suggestion.sameSpecies ? '' : ' em outra espécie'}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Receita que começa pelo nome do medicamento. Escolhido um que a clínica já
 * prescreveu, dose, via, intervalo e duração vêm prontos da última vez e o
 * veterinário só confere. O resto (princípio ativo, quantidade, carência,
 * controle especial) fica recolhido e abre quando precisa. A dose por quilo é
 * calculada na hora, e a mesma conta é refeita no servidor.
 */
function PrescriptionFormSheetContent({
  open,
  onOpenChange,
  encounterId,
  patientId,
  patientName,
  weightKg,
  speciesId = null,
  initialItems,
  title = 'Nova receita',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  encounterId?: string;
  patientId: string;
  patientName: string;
  weightKg: string | null;
  speciesId?: string | null;
  initialItems?: Array<Partial<PrescriptionItemInput> & { drugName: string }>;
  title?: string;
}) {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<ItemDraft[]>(() =>
    initialItems?.length ? initialItems.map(draftFromItem) : [emptyItem()],
  );
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [templateName, setTemplateName] = useState<string | null>(null);

  const weight = weightKg ? Number(weightKg) : null;

  const payloadItems = useMemo(
    () => items.filter((item) => item.drugName.trim()).map(payloadFromDraft),
    [items],
  );

  // Conferência de alergia depois de uma pausa na digitação: o alerta chega
  // quase junto, sem uma requisição por letra do nome do medicamento.
  const checkedItems = useDebounced(payloadItems, 400);
  const allergyCheck = useQuery({
    queryKey: ['allergy-check', patientId, checkedItems.map((item) => `${item.drugName}|${item.activeIngredient ?? ''}`).join(';')],
    queryFn: () =>
      api.post<{ matches: Array<{ substance: string; matchedOn: string }> }>('/prescriptions/check-allergies', {
        patientId,
        items: checkedItems,
      }),
    enabled: open && checkedItems.length > 0,
    placeholderData: (previous) => previous,
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
      toast.success('Receita criada como rascunho. Confira e assine para gerar o PDF.');
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const saveTemplate = useMutation({
    mutationFn: (name: string) =>
      api.post('/prescription-templates', { name, speciesId: speciesId ?? undefined, items: payloadItems }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['prescription-templates'] });
      toast.success('Protocolo salvo. Ele aparece como atalho na próxima receita.');
      setTemplateName(null);
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
      title={title}
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
            <span>Sem peso registrado: a dose por quilo é recusada até o peso ser informado.</span>
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
                  {match.substance}: item “{match.matchedOn}”
                </li>
              ))}
            </ul>
          </div>
        )}

        {items.map((item, index) => {
          const doseValue = toNumber(item.doseValue);
          const computed = item.dosePerKg && weight && doseValue ? doseValue * weight : null;
          const drugId = `rx-${item.key}-drug`;

          return (
            <div key={item.key} className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] px-3.5 py-3">
              <div className="flex items-center justify-between">
                <label htmlFor={drugId} className="text-[13px] font-semibold text-[var(--ink-2)]">
                  {items.length > 1 ? `Medicamento ${index + 1}` : 'Medicamento'}
                </label>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setItems((current) => current.filter((entry) => entry.key !== item.key))}
                    className="rounded p-1 text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                    aria-label="Remover medicamento"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              <DrugNameInput
                id={drugId}
                value={item.drugName}
                speciesId={speciesId}
                onChange={(value) => update(item.key, { drugName: value })}
                onPick={(suggestion) =>
                  setItems((current) =>
                    current.map((entry) => (entry.key === item.key ? fromSuggestion(suggestion, item.key) : entry)),
                  )
                }
              />

              <div className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_110px_minmax(0,1fr)]">
                <Field label="Dose" htmlFor={`rx-${item.key}-dose`}>
                  <div className="flex gap-2">
                    <Input
                      id={`rx-${item.key}-dose`}
                      value={item.doseValue}
                      onChange={(event) => update(item.key, { doseValue: event.target.value })}
                      inputMode="decimal"
                      placeholder="0,5"
                    />
                    <Select
                      aria-label="Unidade da dose"
                      value={item.doseUom}
                      onChange={(event) => update(item.key, { doseUom: event.target.value as DoseUom })}
                      className="w-24"
                    >
                      {Object.entries(DOSE_UOM).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </div>
                </Field>
                <div className="flex items-end pb-1.5">
                  <Checkbox
                    checked={item.dosePerKg}
                    onChange={(event) => update(item.key, { dosePerKg: event.target.checked })}
                    label="por kg"
                  />
                </div>
                <Field label="Via" htmlFor={`rx-${item.key}-route`} className="col-span-2 sm:col-span-1">
                  <Select
                    id={`rx-${item.key}-route`}
                    value={item.route}
                    onChange={(event) => update(item.key, { route: event.target.value })}
                  >
                    {Object.entries(ROUTE).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div>
                <p className="mb-1.5 text-[13px] font-medium text-[var(--ink-2)]">Frequência</p>
                <div className="flex flex-wrap gap-1.5">
                  {['6', '8', '12', '24'].map((hours) => (
                    <Chip
                      key={hours}
                      active={item.frequency.kind === 'interval_hours' && item.frequency.hours === hours}
                      onClick={() => update(item.key, { frequency: { kind: 'interval_hours', hours } })}
                    >
                      {hours} h
                    </Chip>
                  ))}
                  <Chip active={item.frequency.kind === 'once'} onClick={() => update(item.key, { frequency: { kind: 'once' } })}>
                    Dose única
                  </Chip>
                  <Chip active={item.frequency.kind === 'prn'} onClick={() => update(item.key, { frequency: { kind: 'prn' } })}>
                    Se necessário
                  </Chip>
                </div>
              </div>

              {item.frequency.kind !== 'once' && (
                <div>
                  <p className="mb-1.5 text-[13px] font-medium text-[var(--ink-2)]">Duração</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {['3', '5', '7', '10', '14', '30'].map((days) => (
                      <Chip
                        key={days}
                        active={!item.continuous && item.durationDays === days}
                        onClick={() => update(item.key, { durationDays: days, continuous: false })}
                      >
                        {days} d
                      </Chip>
                    ))}
                    <Chip
                      active={item.continuous}
                      onClick={() => update(item.key, { continuous: !item.continuous, durationDays: '' })}
                    >
                      Contínuo
                    </Chip>
                    <Input
                      aria-label="Outra duração em dias"
                      value={item.continuous ? '' : item.durationDays}
                      onChange={(event) => update(item.key, { durationDays: event.target.value, continuous: false })}
                      inputMode="numeric"
                      placeholder="dias"
                      className="h-9 w-20 md:h-9"
                    />
                  </div>
                </div>
              )}

              <p
                className={cn(
                  'rounded-[var(--radius)] px-3 py-2 text-[13px]',
                  item.dosePerKg && !computed ? 'bg-[var(--surface-2)] text-[var(--ink-3)]' : 'bg-[var(--brand-soft)] text-[var(--brand-ink)]',
                )}
              >
                {item.drugName.trim() ? `${item.drugName.trim()}: ` : ''}
                {posologyPreview(item, weight) || 'Informe a dose.'}
                {computed ? ` · total ${formatNumber(computed, 3)} ${DOSE_UOM[item.doseUom]} por administração` : ''}
              </p>

              <button
                type="button"
                onClick={() => update(item.key, { showDetails: !item.showDetails })}
                className="flex items-center gap-1 text-[13px] font-medium text-[var(--brand)]"
                aria-expanded={item.showDetails}
              >
                <ChevronDown className={cn('h-4 w-4 transition-transform', item.showDetails && 'rotate-180')} />
                Orientações, quantidade, controle e carência
              </button>

              {item.showDetails && (
                <div className="space-y-3 rounded-[var(--radius)] bg-[var(--surface-2)] p-3">
                  <Field label="Orientações ao tutor" htmlFor={`rx-${item.key}-instructions`}>
                    <Textarea
                      id={`rx-${item.key}-instructions`}
                      value={item.instructions}
                      onChange={(event) => update(item.key, { instructions: event.target.value })}
                      rows={2}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Field label="Princípio ativo" htmlFor={`rx-${item.key}-ingredient`} className="col-span-2">
                      <Input
                        id={`rx-${item.key}-ingredient`}
                        value={item.activeIngredient}
                        onChange={(event) => update(item.key, { activeIngredient: event.target.value })}
                        placeholder="Usado na conferência de alergia"
                      />
                    </Field>
                    <Field label="Concentração" htmlFor={`rx-${item.key}-concentration`} className="col-span-2">
                      <Input
                        id={`rx-${item.key}-concentration`}
                        value={item.concentration}
                        onChange={(event) => update(item.key, { concentration: event.target.value })}
                        placeholder="Ex.: 50 mg/mL"
                      />
                    </Field>
                    <Field label="Quantidade" htmlFor={`rx-${item.key}-qty`}>
                      <Input
                        id={`rx-${item.key}-qty`}
                        value={item.quantity}
                        onChange={(event) => update(item.key, { quantity: event.target.value })}
                        inputMode="decimal"
                      />
                    </Field>
                    <Field label="Unidade" htmlFor={`rx-${item.key}-qty-uom`}>
                      <Input
                        id={`rx-${item.key}-qty-uom`}
                        value={item.quantityUom}
                        onChange={(event) => update(item.key, { quantityUom: event.target.value })}
                        placeholder="caixa"
                      />
                    </Field>
                    <Field label="Carência carne (d)" htmlFor={`rx-${item.key}-meat`}>
                      <Input
                        id={`rx-${item.key}-meat`}
                        value={item.withdrawalMeatDays}
                        onChange={(event) => update(item.key, { withdrawalMeatDays: event.target.value })}
                        inputMode="numeric"
                      />
                    </Field>
                    <Field label="Carência leite (d)" htmlFor={`rx-${item.key}-milk`}>
                      <Input
                        id={`rx-${item.key}-milk`}
                        value={item.withdrawalMilkDays}
                        onChange={(event) => update(item.key, { withdrawalMilkDays: event.target.value })}
                        inputMode="numeric"
                      />
                    </Field>
                  </div>
                  <Checkbox
                    checked={item.isControlled}
                    onChange={(event) => update(item.key, { isControlled: event.target.checked })}
                    label="Medicamento sujeito a controle especial"
                  />
                  {item.isControlled && (
                    <p className="flex items-start gap-2 rounded-[var(--radius)] bg-[var(--info-soft)] px-3 py-2 text-[12.5px] leading-relaxed text-[var(--info)]">
                      <Info className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        Produto veterinário controlado: a notificação de receita é emitida e numerada no SIPEAGRO
                        (Portaria MAPA nº 837/2025). Medicamento humano controlado ou antimicrobiano de uso humano segue a
                        Anvisa, que só aceita receita eletrônica emitida por sistema integrado ao SNCR. Nos dois casos,
                        imprima esta receita e assine à mão.
                      </span>
                    </p>
                  )}
                  <Checkbox
                    checked={item.extraLabel}
                    onChange={(event) => update(item.key, { extraLabel: event.target.checked })}
                    label="Uso fora de bula (extra-label)"
                  />
                  {item.extraLabel && (
                    <Field label="Justificativa" required htmlFor={`rx-${item.key}-justification`}>
                      <Textarea
                        id={`rx-${item.key}-justification`}
                        value={item.extraLabelJustification}
                        onChange={(event) => update(item.key, { extraLabelJustification: event.target.value })}
                        rows={2}
                      />
                    </Field>
                  )}
                </div>
              )}
            </div>
          );
        })}

        <Button variant="secondary" block onClick={() => setItems((current) => [...current, emptyItem()])}>
          <Plus className="h-4 w-4" />
          Adicionar medicamento
        </Button>

        {showNotes ? (
          <Field label="Observações da receita" htmlFor="rx-notes">
            <Textarea id="rx-notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} />
          </Field>
        ) : (
          <button type="button" onClick={() => setShowNotes(true)} className="text-[13px] font-medium text-[var(--brand)]">
            + Observações da receita
          </button>
        )}

        {templateName === null ? (
          <button
            type="button"
            onClick={() => setTemplateName('')}
            disabled={payloadItems.length === 0}
            className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--brand)] disabled:text-[var(--ink-3)]"
          >
            <BookmarkPlus className="h-4 w-4" />
            Salvar esta receita como protocolo da clínica
          </button>
        ) : (
          <div className="flex flex-col gap-2 rounded-[var(--radius)] border border-dashed border-[var(--brand)]/40 bg-[var(--brand-soft)]/40 p-3 sm:flex-row sm:items-end">
            <Field label="Nome do protocolo" className="flex-1" htmlFor="rx-template-name">
              <Input
                id="rx-template-name"
                autoFocus
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                placeholder="Ex.: Otite: tratamento padrão"
              />
            </Field>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setTemplateName(null)}>
                Cancelar
              </Button>
              <Button
                loading={saveTemplate.isPending}
                disabled={templateName.trim().length < 3}
                onClick={() => saveTemplate.mutate(templateName.trim())}
              >
                Salvar protocolo
              </Button>
            </div>
          </div>
        )}
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
