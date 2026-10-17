import { describe, expect, it } from 'vitest';
import { composePhysicalExam, examGroupFor, examSystemsFor } from './physical-exam';
import { recordCompleteness } from './record-completeness';
import { addDaysIso, nextDoseFor } from './vaccine-schedule';
import { parseDoseUom } from './dose';
import { suggestTemplate } from './template-suggestion';

describe('sugestão de modelo', () => {
  const templates = [
    { name: 'Consulta', kind: 'template', keywords: [], serviceCategories: ['consultation'] },
    { name: 'Otite', kind: 'template', keywords: ['orelha', 'balanca a cabeca'], serviceCategories: [] },
    { name: 'Prurido', kind: 'template', keywords: ['cocando', 'coceira'], serviceCategories: [] },
    { name: 'Vacina', kind: 'template', keywords: ['vacina'], serviceCategories: ['vaccination'] },
    { name: 'Frase', kind: 'snippet', keywords: ['orelha'], serviceCategories: [] },
  ];

  it('a queixa manda: mais palavras reconhecidas vence, sem ligar para acento', () => {
    const result = suggestTemplate(templates, {
      complaint: 'Coçando a orelha esquerda, balança a cabeça',
      serviceCategory: 'consultation',
    });
    expect(result?.name).toBe('Otite');
  });

  it('sem palavra reconhecida, vale o tipo de serviço', () => {
    expect(suggestTemplate(templates, { complaint: 'Mancando', serviceCategory: 'consultation' })?.name).toBe('Consulta');
    expect(suggestTemplate(templates, { complaint: null, serviceCategory: 'vaccination' })?.name).toBe('Vacina');
  });

  it('frase rápida nunca é sugerida como modelo, e sem contexto não sugere nada', () => {
    expect(suggestTemplate(templates.slice(4), { complaint: 'orelha' })).toBeUndefined();
    expect(suggestTemplate(templates, {})).toBeUndefined();
  });
});

describe('unidade de dose gravada fora do padrão', () => {
  it('traduz mg/kg em mg por quilo', () => {
    expect(parseDoseUom('mg/kg')).toEqual({ uom: 'mg', perKg: true });
  });

  it('aceita o nome em português, com acento e maiúscula', () => {
    expect(parseDoseUom('Comprimido')).toEqual({ uom: 'tablet', perKg: false });
    expect(parseDoseUom('mL')).toEqual({ uom: 'ml', perKg: false });
    expect(parseDoseUom('sachê')).toEqual({ uom: 'sachet', perKg: false });
  });

  it('não inventa unidade que não reconhece', () => {
    expect(parseDoseUom('colher de sopa')).toEqual({ uom: null, perKg: false });
    expect(parseDoseUom(null)).toEqual({ uom: null, perKg: false });
  });
});

describe('exame físico normal por padrão', () => {
  it('escolhe o grupo de sistemas pela espécie', () => {
    expect(examGroupFor('dog')).toBe('small_animal');
    expect(examGroupFor('cattle')).toBe('ruminant');
    expect(examGroupFor('horse')).toBe('equine');
    expect(examGroupFor('desconhecida')).toBe('generic');
    expect(examGroupFor(null)).toBe('generic');
  });

  it('bovino tem rúmen e cão não tem', () => {
    expect(examSystemsFor('cattle').some((s) => s.key === 'rumen')).toBe(true);
    expect(examSystemsFor('dog').some((s) => s.key === 'rumen')).toBe(false);
  });

  it('sem achados, todo sistema entra com o texto de normalidade', () => {
    const systems = examSystemsFor('cat');
    const text = composePhysicalExam(systems, {});
    expect(text.split('\n')).toHaveLength(systems.length);
    expect(text).toContain('Mucosas: normocoradas, úmidas, TPC < 2 s.');
  });

  it('alterado vem primeiro, marcado, e não repete a normalidade', () => {
    const systems = examSystemsFor('dog');
    const text = composePhysicalExam(systems, { ears: { abnormal: 'secreção ceruminosa e eritema no conduto direito.' } });
    const lines = text.split('\n');
    expect(lines[0]).toBe('Ouvidos (alterado): secreção ceruminosa e eritema no conduto direito.');
    expect(lines.filter((line) => line.startsWith('Ouvidos'))).toHaveLength(1);
  });

  it('sistema não avaliado fica fora do texto', () => {
    const text = composePhysicalExam(examSystemsFor('dog'), { neuro: { skipped: true } });
    expect(text).not.toContain('Neurológico');
  });
});

describe('indicador de conteúdo mínimo', () => {
  it('começa vazio e completa conforme o registro cresce', () => {
    const empty = recordCompleteness({ noteKinds: [], observationCount: 0, diagnosisCount: 0 });
    expect(empty.every((item) => !item.done)).toBe(true);

    const full = recordCompleteness({
      noteKinds: [
        { kind: 'chief_complaint', body: 'Coceira há 5 dias' },
        { kind: 'plan', body: 'Limpeza otológica' },
      ],
      observationCount: 3,
      diagnosisCount: 1,
    });
    expect(full.every((item) => item.done)).toBe(true);
  });

  it('nota em branco não conta', () => {
    const result = recordCompleteness({
      noteKinds: [{ kind: 'plan', body: '   ' }],
      observationCount: 0,
      diagnosisCount: 0,
    });
    expect(result.find((item) => item.key === 'plan')?.done).toBe(false);
  });
});

describe('protocolo vacinal', () => {
  const v10 = {
    steps: [
      { label: '1ª dose', intervalToNextDays: 21 },
      { label: '2ª dose', intervalToNextDays: 21 },
      { label: '3ª dose', intervalToNextDays: null },
    ],
    boosterIntervalDays: 365,
  };

  it('primeira aplicação é a 1ª dose, com a próxima em 21 dias', () => {
    expect(nextDoseFor(v10, 0)).toEqual({ doseNumber: 1, label: '1ª dose', nextIntervalDays: 21 });
  });

  it('a última dose da série aponta para o reforço anual', () => {
    expect(nextDoseFor(v10, 2)).toEqual({ doseNumber: 3, label: '3ª dose', nextIntervalDays: 365 });
  });

  it('depois da série, toda aplicação é reforço', () => {
    expect(nextDoseFor(v10, 5)).toEqual({ doseNumber: 6, label: 'Reforço', nextIntervalDays: 365 });
  });

  it('soma dias sem depender do fuso', () => {
    expect(addDaysIso(new Date('2026-10-15T23:30:00Z'), 21)).toBe('2026-11-05');
  });
});
