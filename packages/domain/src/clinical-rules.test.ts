import { describe, expect, it } from 'vitest';
import {
  assertMinimumContent,
  ageLabel,
  classifyObservation,
  lifeStageFor,
  type EncounterContentSnapshot,
} from './clinical-rules';
import { DomainError } from './errors';

const empty: EncounterContentSnapshot = {
  hasAssessmentNote: false,
  hasAnyNote: false,
  hasTriageNote: false,
  hasProcedureNote: false,
  diagnosisCount: 0,
  procedureCount: 0,
  immunizationCount: 0,
  examOrderCount: 0,
  observationCount: 0,
  justification: null,
};

describe('conteúdo mínimo para finalizar', () => {
  it('recusa consulta sem avaliação nem diagnóstico', () => {
    expect(() => assertMinimumContent('consultation', empty)).toThrow(DomainError);
  });

  it('aceita consulta com avaliação registrada', () => {
    expect(() => assertMinimumContent('consultation', { ...empty, hasAssessmentNote: true })).not.toThrow();
  });

  it('aceita consulta com diagnóstico registrado', () => {
    expect(() => assertMinimumContent('consultation', { ...empty, diagnosisCount: 1 })).not.toThrow();
  });

  it('exige aplicação em atendimento de vacinação', () => {
    expect(() => assertMinimumContent('vaccination', { ...empty, hasAnyNote: true })).toThrow(DomainError);
    expect(() => assertMinimumContent('vaccination', { ...empty, immunizationCount: 1 })).not.toThrow();
  });

  it('exige pedido em atendimento de exame', () => {
    expect(() => assertMinimumContent('exam', empty)).toThrow(DomainError);
    expect(() => assertMinimumContent('exam', { ...empty, examOrderCount: 1 })).not.toThrow();
  });

  it('exige nota de procedimento e procedimento em cirurgia', () => {
    expect(() => assertMinimumContent('surgery', { ...empty, procedureCount: 1 })).toThrow(DomainError);
    expect(() =>
      assertMinimumContent('surgery', { ...empty, procedureCount: 1, hasProcedureNote: true }),
    ).not.toThrow();
  });

  it('aceita justificativa explícita como saída consciente', () => {
    expect(() => assertMinimumContent('surgery', { ...empty, justification: 'Cancelado no pré-operatório.' })).not.toThrow();
  });

  it('usa a regra genérica para categoria desconhecida', () => {
    expect(() => assertMinimumContent('other', empty)).toThrow(DomainError);
    expect(() => assertMinimumContent('other', { ...empty, observationCount: 1 })).not.toThrow();
  });
});

describe('ageLabel', () => {
  const reference = new Date('2026-08-16T12:00:00Z');

  it('descreve anos e meses a partir da data de nascimento', () => {
    expect(ageLabel(new Date('2019-03-14'), null, reference)).toBe('7 anos e 5 meses');
  });

  it('descreve só meses para filhote', () => {
    expect(ageLabel(new Date('2026-02-16'), null, reference)).toContain('meses');
  });

  it('usa a idade estimada quando não há data de nascimento', () => {
    expect(ageLabel(null, 96, reference)).toBe('8 anos');
  });

  it('devolve nulo quando não há informação de idade', () => {
    expect(ageLabel(null, null, reference)).toBeNull();
  });
});

describe('lifeStageFor', () => {
  it('classifica cão por faixa etária', () => {
    expect(lifeStageFor('dog', 6)).toBe('puppy');
    expect(lifeStageFor('dog', 48)).toBe('adult');
    expect(lifeStageFor('dog', 130)).toBe('senior');
  });

  it('devolve nulo sem idade conhecida', () => {
    expect(lifeStageFor('dog', null)).toBeNull();
  });
});

describe('classifyObservation', () => {
  const validated = [
    {
      minValue: 37.5,
      maxValue: 39.2,
      uom: 'C',
      validationStatus: 'validated' as const,
      lifeStage: null,
      sex: null,
      weightMinKg: null,
      weightMaxKg: null,
    },
  ];

  const unvalidated = [{ ...validated[0]!, validationStatus: 'unvalidated' as const }];

  it('marca valor dentro da faixa como normal', () => {
    const result = classifyObservation(38.4, validated, {});
    expect(result.flag).toBe('normal');
    expect(result.status).toBe('validated');
  });

  it('marca valor abaixo e acima da faixa', () => {
    expect(classifyObservation(36.8, validated, {}).flag).toBe('low');
    expect(classifyObservation(40.1, validated, {}).flag).toBe('high');
  });

  it('trata faixa não validada como informativa, nunca como parâmetro clínico', () => {
    const result = classifyObservation(40.1, unvalidated, {});
    expect(result.flag).toBe('high');
    expect(result.status).toBe('informational');
  });

  it('não classifica quando não há faixa aplicável', () => {
    const result = classifyObservation(38.4, [], {});
    expect(result.flag).toBeNull();
    expect(result.range).toBeNull();
  });

  it('descarta faixa de outro estágio de vida', () => {
    const puppyOnly = [{ ...validated[0]!, lifeStage: 'puppy' as const }];
    expect(classifyObservation(38.4, puppyOnly, { lifeStage: 'senior' }).flag).toBeNull();
    expect(classifyObservation(38.4, puppyOnly, { lifeStage: 'puppy' }).flag).toBe('normal');
  });

  it('descarta faixa fora do peso do paciente', () => {
    const heavyOnly = [{ ...validated[0]!, weightMinKg: 40 }];
    expect(classifyObservation(38.4, heavyOnly, { weightKg: 4.1 }).flag).toBeNull();
  });
});
