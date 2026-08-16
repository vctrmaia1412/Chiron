import { DomainError } from './errors';

/**
 * Conteúdo mínimo para finalizar um atendimento, por categoria de serviço.
 * Uma visita de vacinação não exige diagnóstico; uma consulta exige avaliação,
 * diagnóstico ou justificativa explícita.
 */
export type ServiceCategory =
  | 'consultation'
  | 'return'
  | 'vaccination'
  | 'preventive'
  | 'exam'
  | 'procedure'
  | 'surgery'
  | 'hospital_day'
  | 'grooming'
  | 'telehealth'
  | 'other';

export interface EncounterContentSnapshot {
  hasAssessmentNote: boolean;
  hasAnyNote: boolean;
  hasTriageNote: boolean;
  hasProcedureNote: boolean;
  diagnosisCount: number;
  procedureCount: number;
  immunizationCount: number;
  examOrderCount: number;
  observationCount: number;
  justification?: string | null;
}

export interface MinimumContentRule {
  describe: string;
  satisfied: (s: EncounterContentSnapshot) => boolean;
}

export const MINIMUM_CONTENT_RULES: Record<ServiceCategory, MinimumContentRule> = {
  consultation: {
    describe: 'Registre a avaliação, um diagnóstico ou uma justificativa para finalizar.',
    satisfied: (s) => s.hasAssessmentNote || s.diagnosisCount > 0 || Boolean(s.justification),
  },
  return: {
    describe: 'Registre a evolução, um diagnóstico ou uma justificativa para finalizar.',
    satisfied: (s) => s.hasAnyNote || s.diagnosisCount > 0 || Boolean(s.justification),
  },
  vaccination: {
    describe: 'Registre ao menos uma aplicação de vacina ou preventivo.',
    satisfied: (s) => s.immunizationCount > 0 || Boolean(s.justification),
  },
  preventive: {
    describe: 'Registre ao menos uma aplicação de preventivo.',
    satisfied: (s) => s.immunizationCount > 0 || Boolean(s.justification),
  },
  exam: {
    describe: 'Registre ao menos um pedido de exame.',
    satisfied: (s) => s.examOrderCount > 0 || Boolean(s.justification),
  },
  procedure: {
    describe: 'Registre o procedimento realizado.',
    satisfied: (s) => s.procedureCount > 0 || s.hasProcedureNote || Boolean(s.justification),
  },
  surgery: {
    describe: 'Registre a nota do procedimento e a nota anestésica.',
    satisfied: (s) => (s.hasProcedureNote && s.procedureCount > 0) || Boolean(s.justification),
  },
  hospital_day: {
    describe: 'Registre ao menos uma evolução.',
    satisfied: (s) => s.hasAnyNote || Boolean(s.justification),
  },
  grooming: {
    describe: 'Registre uma observação sobre o atendimento.',
    satisfied: (s) => s.hasAnyNote || s.observationCount > 0 || Boolean(s.justification),
  },
  telehealth: {
    describe: 'Registre a avaliação ou a conduta.',
    satisfied: (s) => s.hasAssessmentNote || s.hasAnyNote || Boolean(s.justification),
  },
  other: {
    describe: 'Registre ao menos uma informação clínica antes de finalizar.',
    satisfied: (s) =>
      s.hasAnyNote || s.diagnosisCount > 0 || s.observationCount > 0 || s.procedureCount > 0 || Boolean(s.justification),
  },
};

export function assertMinimumContent(
  category: ServiceCategory,
  snapshot: EncounterContentSnapshot,
): void {
  const rule = MINIMUM_CONTENT_RULES[category] ?? MINIMUM_CONTENT_RULES.other;
  if (!rule.satisfied(snapshot)) {
    throw new DomainError('MINIMUM_CONTENT_REQUIRED', rule.describe, { category });
  }
}

/** Idade legível a partir da data de nascimento. */
export function ageLabel(birthDate: Date | null, estimatedAgeMonths?: number | null, reference = new Date()): string | null {
  let months: number | null = null;
  if (birthDate) {
    months =
      (reference.getUTCFullYear() - birthDate.getUTCFullYear()) * 12 +
      (reference.getUTCMonth() - birthDate.getUTCMonth());
    if (reference.getUTCDate() < birthDate.getUTCDate()) months -= 1;
  } else if (estimatedAgeMonths != null) {
    months = estimatedAgeMonths;
  }
  if (months == null || months < 0) return null;

  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return rest <= 1 ? `${Math.max(months, 0)} mês` : `${rest} meses`;
  if (rest === 0) return years === 1 ? '1 ano' : `${years} anos`;
  return `${years} ${years === 1 ? 'ano' : 'anos'} e ${rest} ${rest === 1 ? 'mês' : 'meses'}`;
}

export type LifeStage = 'puppy' | 'adult' | 'senior';

/** Fase de vida aproximada, usada para escolher a faixa de referência. */
export function lifeStageFor(speciesCode: string, ageMonths: number | null): LifeStage | null {
  if (ageMonths == null) return null;
  const youngLimit = speciesCode === 'dog' || speciesCode === 'cat' ? 12 : 12;
  const seniorLimit = speciesCode === 'dog' ? 96 : speciesCode === 'cat' ? 120 : 180;
  if (ageMonths < youngLimit) return 'puppy';
  if (ageMonths >= seniorLimit) return 'senior';
  return 'adult';
}

export interface ReferenceRangeLike {
  minValue: number | null;
  maxValue: number | null;
  lifeStage: string | null;
  sex: string | null;
  weightMinKg: number | null;
  weightMaxKg: number | null;
  validationStatus: 'unvalidated' | 'validated';
}

export type AbnormalFlag = 'low' | 'normal' | 'high' | 'critical';

export interface FlagResult {
  flag: AbnormalFlag | null;
  status: 'informational' | 'validated' | null;
  range: ReferenceRangeLike | null;
}

/**
 * Seleciona a faixa mais específica aplicável e classifica o valor.
 * Faixa não validada pelo tenant gera apenas sinal informativo.
 */
export function classifyObservation(
  value: number,
  ranges: readonly ReferenceRangeLike[],
  context: { lifeStage?: LifeStage | null; sex?: string | null; weightKg?: number | null },
): FlagResult {
  const applicable = ranges.filter((r) => {
    if (r.lifeStage && context.lifeStage && r.lifeStage !== context.lifeStage) return false;
    if (r.lifeStage && !context.lifeStage) return false;
    if (r.sex && context.sex && r.sex !== context.sex) return false;
    if (r.weightMinKg != null && context.weightKg != null && context.weightKg < r.weightMinKg) return false;
    if (r.weightMaxKg != null && context.weightKg != null && context.weightKg > r.weightMaxKg) return false;
    return true;
  });

  if (applicable.length === 0) return { flag: null, status: null, range: null };

  // mais específica primeiro: com life stage e faixa de peso
  const sorted = [...applicable].sort((a, b) => specificity(b) - specificity(a));
  const range = sorted[0] ?? null;
  if (!range) return { flag: null, status: null, range: null };

  let flag: AbnormalFlag = 'normal';
  if (range.minValue != null && value < range.minValue) flag = 'low';
  else if (range.maxValue != null && value > range.maxValue) flag = 'high';

  return {
    flag,
    status: range.validationStatus === 'validated' ? 'validated' : 'informational',
    range,
  };
}

function specificity(r: ReferenceRangeLike): number {
  let score = 0;
  if (r.lifeStage) score += 2;
  if (r.sex) score += 1;
  if (r.weightMinKg != null || r.weightMaxKg != null) score += 2;
  if (r.validationStatus === 'validated') score += 4;
  return score;
}
