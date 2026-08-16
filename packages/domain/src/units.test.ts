import { describe, expect, it } from 'vitest';
import {
  OBSERVATION_CODES,
  celsiusFromFahrenheit,
  formatWeight,
  fromKilograms,
  glucoseToMgDl,
  normalizeObservation,
  round,
  toKilograms,
} from './units';
import { DomainError } from './errors';

describe('conversão de peso', () => {
  it('converte gramas e libras para quilos', () => {
    expect(toKilograms(920, 'g')).toBeCloseTo(0.92, 4);
    expect(toKilograms(10, 'lb')).toBeCloseTo(4.5359, 3);
    expect(toKilograms(32.4, 'kg')).toBe(32.4);
  });

  it('faz o caminho de volta sem perder o valor', () => {
    expect(fromKilograms(0.92, 'g')).toBeCloseTo(920, 1);
    expect(fromKilograms(4.5359237, 'lb')).toBeCloseTo(10, 3);
  });

  it('formata peso de animal pequeno em gramas', () => {
    expect(formatWeight(0.092)).toContain('g');
    expect(formatWeight(32.4)).toContain('kg');
  });
});

describe('conversão de temperatura e glicemia', () => {
  it('converte Fahrenheit para Celsius', () => {
    expect(celsiusFromFahrenheit(101.5)).toBeCloseTo(38.6, 1);
  });

  it('converte mmol/L para mg/dL', () => {
    expect(glucoseToMgDl(5.5, 'mmol/L')).toBeCloseTo(99.1, 1);
    expect(glucoseToMgDl(99, 'mg/dL')).toBe(99);
  });
});

describe('normalizeObservation', () => {
  it('normaliza peso digitado em gramas para quilos', () => {
    const result = normalizeObservation({ code: 'weight', value: 920, uom: 'g' });
    expect(result.valueNumeric).toBeCloseTo(0.92, 4);
    expect(result.uom).toBe('kg');
    expect(result.enteredValue).toBe('920');
    expect(result.enteredUom).toBe('g');
  });

  it('normaliza temperatura digitada em Fahrenheit para Celsius', () => {
    const result = normalizeObservation({ code: 'temperature', value: 101.5, uom: 'F' });
    expect(result.valueNumeric).toBeCloseTo(38.6, 1);
    expect(result.uom).toBe('C');
  });

  it('aceita valor numérico com vírgula decimal', () => {
    const result = normalizeObservation({ code: 'temperature', value: '38,6' });
    expect(result.valueNumeric).toBeCloseTo(38.6, 1);
  });

  it('recusa unidade fora da lista permitida', () => {
    expect(() => normalizeObservation({ code: 'temperature', value: 38, uom: 'K' })).toThrow(DomainError);
  });

  it('recusa código de observação desconhecido', () => {
    expect(() => normalizeObservation({ code: 'nao_existe', value: 1 })).toThrow(DomainError);
  });

  it('recusa valor não numérico em código numérico', () => {
    expect(() => normalizeObservation({ code: 'heart_rate', value: 'rápido' })).toThrow(DomainError);
  });

  it('valida código categórico contra a lista de valores', () => {
    const ok = normalizeObservation({ code: 'mucous_membranes', value: 'rosadas' });
    expect(ok.valueCode).toBe('rosadas');
    expect(() => normalizeObservation({ code: 'mucous_membranes', value: 'roxa' })).toThrow(DomainError);
  });
});

describe('catálogo de observações', () => {
  it('não tem código duplicado', () => {
    const codes = OBSERVATION_CODES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('todo código numérico declara unidade canônica', () => {
    for (const code of OBSERVATION_CODES.filter((c) => c.valueKind === 'numeric')) {
      expect(code.canonicalUom, `código ${code.code}`).toBeTruthy();
    }
  });

  it('todo código categórico declara os valores aceitos', () => {
    for (const code of OBSERVATION_CODES.filter((c) => c.valueKind === 'code')) {
      expect(code.allowedCodes?.length, `código ${code.code}`).toBeGreaterThan(0);
    }
  });

  it('cobre parâmetros de grandes animais, não só de cão e gato', () => {
    const codes = OBSERVATION_CODES.map((c) => c.code);
    expect(codes).toContain('rumen_motility');
    expect(codes).toContain('ambient_temperature');
  });
});

describe('round', () => {
  it('arredonda sem erro de ponto flutuante', () => {
    expect(round(1.005, 2)).toBe(1.01);
    expect(round(3.2400000000000002, 4)).toBe(3.24);
  });
});
