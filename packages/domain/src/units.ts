import { DomainError } from './errors';

/**
 * Conversão de unidades para o valor canônico de cada código de observação.
 * Todo valor é guardado na unidade canônica; o valor digitado é preservado.
 */

export type WeightUom = 'kg' | 'g' | 'lb';

const WEIGHT_TO_KG: Record<WeightUom, number> = {
  kg: 1,
  g: 0.001,
  lb: 0.45359237,
};

export function toKilograms(value: number, uom: WeightUom): number {
  const factor = WEIGHT_TO_KG[uom];
  if (factor === undefined) throw new DomainError('VALIDATION_FAILED', `Unidade de peso inválida: ${uom}`);
  return round(value * factor, 4);
}

export function fromKilograms(valueKg: number, uom: WeightUom): number {
  const factor = WEIGHT_TO_KG[uom];
  if (factor === undefined) throw new DomainError('VALIDATION_FAILED', `Unidade de peso inválida: ${uom}`);
  return round(valueKg / factor, 4);
}

/** Formata peso na unidade mais legível para a espécie (g abaixo de 1 kg). */
export function formatWeight(valueKg: number, preferred: WeightUom = 'kg'): string {
  if (preferred === 'g' || valueKg < 1) {
    const grams = round(valueKg * 1000, 0);
    return `${formatNumber(grams)} g`;
  }
  return `${formatNumber(round(valueKg, 3))} kg`;
}

export function celsiusFromFahrenheit(f: number): number {
  return round(((f - 32) * 5) / 9, 1);
}

export function fahrenheitFromCelsius(c: number): number {
  return round((c * 9) / 5 + 32, 1);
}

/** mg/dL <-> mmol/L para glicose (fator 18.0182). */
export function glucoseToMgDl(value: number, uom: 'mg/dL' | 'mmol/L'): number {
  return uom === 'mmol/L' ? round(value * 18.0182, 1) : round(value, 1);
}

export interface ObservationCodeSpec {
  code: string;
  name: string;
  valueKind: 'numeric' | 'text' | 'code';
  canonicalUom: string | null;
  allowedUoms: string[];
  allowedCodes?: string[];
  scale?: string;
  sort: number;
  /** Painel padrão: espécies em que o código aparece por padrão. `null` = todas. */
  defaultForCategories: string[] | null;
}

export const OBSERVATION_CODES: readonly ObservationCodeSpec[] = [
  {
    code: 'weight',
    name: 'Peso',
    valueKind: 'numeric',
    canonicalUom: 'kg',
    allowedUoms: ['kg', 'g', 'lb'],
    sort: 10,
    defaultForCategories: null,
  },
  {
    code: 'temperature',
    name: 'Temperatura',
    valueKind: 'numeric',
    canonicalUom: 'C',
    allowedUoms: ['C', 'F'],
    sort: 20,
    defaultForCategories: null,
  },
  {
    code: 'heart_rate',
    name: 'Frequência cardíaca',
    valueKind: 'numeric',
    canonicalUom: 'bpm',
    allowedUoms: ['bpm'],
    sort: 30,
    defaultForCategories: null,
  },
  {
    code: 'respiratory_rate',
    name: 'Frequência respiratória',
    valueKind: 'numeric',
    canonicalUom: 'mpm',
    allowedUoms: ['mpm'],
    sort: 40,
    defaultForCategories: null,
  },
  {
    code: 'systolic_bp',
    name: 'Pressão sistólica',
    valueKind: 'numeric',
    canonicalUom: 'mmHg',
    allowedUoms: ['mmHg'],
    sort: 50,
    defaultForCategories: ['companion', 'equine'],
  },
  {
    code: 'diastolic_bp',
    name: 'Pressão diastólica',
    valueKind: 'numeric',
    canonicalUom: 'mmHg',
    allowedUoms: ['mmHg'],
    sort: 60,
    defaultForCategories: ['companion', 'equine'],
  },
  {
    code: 'spo2',
    name: 'Saturação (SpO2)',
    valueKind: 'numeric',
    canonicalUom: '%',
    allowedUoms: ['%'],
    sort: 70,
    defaultForCategories: ['companion', 'equine'],
  },
  {
    code: 'capillary_refill_time',
    name: 'Tempo de preenchimento capilar',
    valueKind: 'numeric',
    canonicalUom: 's',
    allowedUoms: ['s'],
    sort: 80,
    defaultForCategories: ['companion', 'equine', 'livestock'],
  },
  {
    code: 'mucous_membranes',
    name: 'Mucosas',
    valueKind: 'code',
    canonicalUom: null,
    allowedUoms: [],
    allowedCodes: ['rosadas', 'palidas', 'cianoticas', 'ictericas', 'congestas', 'hiperemicas'],
    sort: 90,
    defaultForCategories: ['companion', 'equine', 'livestock'],
  },
  {
    code: 'hydration',
    name: 'Hidratação (desidratação estimada)',
    valueKind: 'numeric',
    canonicalUom: '%',
    allowedUoms: ['%'],
    sort: 100,
    defaultForCategories: null,
  },
  {
    code: 'body_condition_score',
    name: 'Escore de condição corporal',
    valueKind: 'numeric',
    canonicalUom: 'escore',
    allowedUoms: ['escore'],
    scale: '1-9',
    sort: 110,
    defaultForCategories: null,
  },
  {
    code: 'pain_score',
    name: 'Escore de dor',
    valueKind: 'numeric',
    canonicalUom: 'escore',
    allowedUoms: ['escore'],
    scale: '0-10',
    sort: 120,
    defaultForCategories: ['companion', 'equine'],
  },
  {
    code: 'blood_glucose',
    name: 'Glicemia',
    valueKind: 'numeric',
    canonicalUom: 'mg/dL',
    allowedUoms: ['mg/dL', 'mmol/L'],
    sort: 130,
    defaultForCategories: [],
  },
  {
    code: 'mentation',
    name: 'Estado mental',
    valueKind: 'code',
    canonicalUom: null,
    allowedUoms: [],
    allowedCodes: ['alerta', 'deprimido', 'estuporoso', 'comatoso'],
    sort: 140,
    defaultForCategories: ['companion', 'equine', 'livestock'],
  },
  {
    code: 'ambient_temperature',
    name: 'Temperatura ambiente',
    valueKind: 'numeric',
    canonicalUom: 'C',
    allowedUoms: ['C', 'F'],
    sort: 150,
    defaultForCategories: ['exotic'],
  },
  {
    code: 'rumen_motility',
    name: 'Motilidade ruminal',
    valueKind: 'numeric',
    canonicalUom: 'mov/2min',
    allowedUoms: ['mov/2min'],
    sort: 160,
    defaultForCategories: ['livestock'],
  },
];

export const OBSERVATION_CODE_BY_KEY: Record<string, ObservationCodeSpec> = Object.fromEntries(
  OBSERVATION_CODES.map((c) => [c.code, c]),
);

export interface NormalizedObservation {
  code: string;
  valueNumeric: number | null;
  valueText: string | null;
  valueCode: string | null;
  uom: string | null;
  enteredValue: string;
  enteredUom: string | null;
}

/**
 * Converte o valor digitado para a unidade canônica do código.
 * Rejeita unidade não permitida e valor com tipo incompatível.
 */
export function normalizeObservation(input: {
  code: string;
  value: number | string;
  uom?: string | null;
}): NormalizedObservation {
  const spec = OBSERVATION_CODE_BY_KEY[input.code];
  if (!spec) throw new DomainError('VALIDATION_FAILED', `Código de observação desconhecido: ${input.code}`);

  const enteredValue = String(input.value);
  const enteredUom = input.uom ?? spec.canonicalUom;

  if (spec.valueKind === 'code') {
    const value = String(input.value).trim().toLowerCase();
    if (spec.allowedCodes && !spec.allowedCodes.includes(value)) {
      throw new DomainError(
        'VALIDATION_FAILED',
        `Valor inválido para ${spec.name}. Use um de: ${spec.allowedCodes.join(', ')}`,
        { code: input.code, allowed: spec.allowedCodes },
      );
    }
    return { code: spec.code, valueNumeric: null, valueText: null, valueCode: value, uom: null, enteredValue, enteredUom: null };
  }

  if (spec.valueKind === 'text') {
    return {
      code: spec.code,
      valueNumeric: null,
      valueText: String(input.value).slice(0, 500),
      valueCode: null,
      uom: null,
      enteredValue,
      enteredUom: null,
    };
  }

  const numeric = typeof input.value === 'number' ? input.value : Number(String(input.value).replace(',', '.'));
  if (!Number.isFinite(numeric)) {
    throw new DomainError('VALIDATION_FAILED', `Valor numérico inválido para ${spec.name}`, { code: input.code });
  }

  const uom = (input.uom ?? spec.canonicalUom) as string;
  if (spec.allowedUoms.length > 0 && !spec.allowedUoms.includes(uom)) {
    throw new DomainError(
      'VALIDATION_FAILED',
      `Unidade inválida para ${spec.name}. Use uma de: ${spec.allowedUoms.join(', ')}`,
      { code: input.code, allowed: spec.allowedUoms },
    );
  }

  let canonical = numeric;
  if (spec.code === 'weight') canonical = toKilograms(numeric, uom as WeightUom);
  else if (spec.canonicalUom === 'C' && uom === 'F') canonical = celsiusFromFahrenheit(numeric);
  else if (spec.code === 'blood_glucose') canonical = glucoseToMgDl(numeric, uom as 'mg/dL' | 'mmol/L');

  return {
    code: spec.code,
    valueNumeric: round(canonical, 4),
    valueText: null,
    valueCode: null,
    uom: spec.canonicalUom,
    enteredValue,
    enteredUom: uom,
  };
}

export function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(value);
}
