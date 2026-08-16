import { DomainError } from './errors';
import { round } from './units';

export type DoseUom = 'mg' | 'ml' | 'g' | 'ui' | 'tablet' | 'capsule' | 'drop' | 'sachet' | 'application';

export interface DoseInput {
  doseValue: number;
  doseUom: DoseUom;
  dosePerKg: boolean;
  weightKg?: number | null;
  /** Concentração do produto, quando houver (ex.: 50 mg/mL). */
  concentrationValue?: number | null;
  concentrationUom?: string | null;
}

export interface DoseResult {
  /** Dose total na unidade informada (mg, mL...). */
  totalDose: number;
  totalDoseUom: DoseUom;
  /** Volume/quantidade a administrar quando há concentração compatível. */
  administerValue: number | null;
  administerUom: string | null;
  label: string;
}

/**
 * Calcula a dose total a partir da dose por kg e do peso do paciente.
 * Sem peso, uma dose por kg não pode ser resolvida: erro explícito em vez de
 * assumir valor (o protótipo pré-preenchia 6 kg para qualquer espécie).
 */
export function computeDose(input: DoseInput): DoseResult {
  const { doseValue, doseUom, dosePerKg, weightKg, concentrationValue, concentrationUom } = input;

  if (doseValue <= 0) {
    throw new DomainError('VALIDATION_FAILED', 'A dose deve ser maior que zero.');
  }

  let totalDose = doseValue;
  if (dosePerKg) {
    if (!weightKg || weightKg <= 0) {
      throw new DomainError(
        'VALIDATION_FAILED',
        'Registre o peso do paciente para calcular a dose por quilo.',
        { field: 'weightKg' },
      );
    }
    totalDose = doseValue * weightKg;
  }
  totalDose = round(totalDose, 4);

  let administerValue: number | null = null;
  let administerUom: string | null = null;

  // mg de dose + concentração mg/mL => volume em mL
  if (concentrationValue && concentrationValue > 0 && concentrationUom) {
    const normalized = concentrationUom.toLowerCase().replace(/\s/g, '');
    if ((doseUom === 'mg' && normalized === 'mg/ml') || (doseUom === 'ui' && normalized === 'ui/ml')) {
      administerValue = round(totalDose / concentrationValue, 3);
      administerUom = 'mL';
    } else if (doseUom === 'mg' && (normalized === 'mg/comprimido' || normalized === 'mg/tablet')) {
      administerValue = round(totalDose / concentrationValue, 2);
      administerUom = 'comprimido(s)';
    }
  }

  const parts: string[] = [`${formatDose(totalDose)} ${doseUnitLabel(doseUom)}`];
  if (dosePerKg && weightKg) parts.push(`(${formatDose(doseValue)} ${doseUnitLabel(doseUom)}/kg x ${formatDose(weightKg)} kg)`);
  if (administerValue !== null && administerUom) parts.push(`= ${formatDose(administerValue)} ${administerUom}`);

  return {
    totalDose,
    totalDoseUom: doseUom,
    administerValue,
    administerUom,
    label: parts.join(' '),
  };
}

export function doseUnitLabel(uom: DoseUom): string {
  const labels: Record<DoseUom, string> = {
    mg: 'mg',
    ml: 'mL',
    g: 'g',
    ui: 'UI',
    tablet: 'comprimido(s)',
    capsule: 'cápsula(s)',
    drop: 'gota(s)',
    sachet: 'sachê(s)',
    application: 'aplicação(ões)',
  };
  return labels[uom] ?? uom;
}

function formatDose(value: number): string {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(value);
}

export type FrequencyKind = 'interval_hours' | 'times_per_day' | 'once' | 'prn' | 'continuous' | 'free';

export function frequencyLabel(kind: FrequencyKind | null | undefined, value?: number | null): string {
  switch (kind) {
    case 'interval_hours':
      return value ? `a cada ${formatDose(value)} h` : 'intervalo definido';
    case 'times_per_day':
      return value ? `${formatDose(value)}x ao dia` : 'vezes ao dia';
    case 'once':
      return 'dose única';
    case 'prn':
      return 'se necessário';
    case 'continuous':
      return 'uso contínuo';
    default:
      return '';
  }
}

export function durationLabel(days?: number | null): string {
  if (!days) return '';
  return days === 1 ? 'por 1 dia' : `por ${days} dias`;
}

/** Texto completo da posologia para impressão na receita. */
export function posologyLabel(params: {
  dose: DoseResult | null;
  route?: string | null;
  frequencyKind?: FrequencyKind | null;
  frequencyValue?: number | null;
  durationDays?: number | null;
  instructions?: string | null;
}): string {
  const parts = [
    params.dose?.label,
    params.route ? `via ${params.route}` : null,
    frequencyLabel(params.frequencyKind, params.frequencyValue),
    durationLabel(params.durationDays),
  ].filter((x): x is string => Boolean(x && x.length > 0));
  const base = parts.join(', ');
  return params.instructions ? `${base}. ${params.instructions}` : base;
}

/**
 * Normaliza o princípio ativo para comparar com alergias registradas
 * (sem acento, minúsculo, sem pontuação).
 */
export function normalizeIngredient(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface AllergyMatch {
  substance: string;
  matchedOn: string;
}

/** Cruza itens da receita com alergias ativas do paciente. */
export function matchAllergies(
  items: Array<{ drugName: string; activeIngredient?: string | null; productId?: string | null }>,
  allergies: Array<{ substance: string; normalized: string; productId?: string | null }>,
): AllergyMatch[] {
  const matches: AllergyMatch[] = [];
  for (const item of items) {
    const candidates = [item.drugName, item.activeIngredient ?? '']
      .filter(Boolean)
      .map((x) => normalizeIngredient(x));
    for (const allergy of allergies) {
      const byProduct = Boolean(item.productId && allergy.productId && item.productId === allergy.productId);
      const byName = candidates.some(
        (c) => c.length > 2 && (c.includes(allergy.normalized) || allergy.normalized.includes(c)),
      );
      if (byProduct || byName) {
        matches.push({ substance: allergy.substance, matchedOn: item.drugName });
      }
    }
  }
  return matches;
}
