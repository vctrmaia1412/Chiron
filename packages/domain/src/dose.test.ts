import { describe, expect, it } from 'vitest';
import { computeDose, matchAllergies, normalizeIngredient, posologyLabel } from './dose';
import { DomainError } from './errors';

describe('computeDose', () => {
  it('multiplica a dose por quilo pelo peso do paciente', () => {
    const result = computeDose({ doseValue: 0.1, doseUom: 'mg', dosePerKg: true, weightKg: 32.4 });
    expect(result.totalDose).toBeCloseTo(3.24, 4);
    expect(result.totalDoseUom).toBe('mg');
  });

  it('mantém a dose fixa quando não é por quilo', () => {
    const result = computeDose({ doseValue: 1, doseUom: 'tablet', dosePerKg: false, weightKg: 32.4 });
    expect(result.totalDose).toBe(1);
  });

  it('recusa dose por quilo sem peso registrado', () => {
    expect(() => computeDose({ doseValue: 0.1, doseUom: 'mg', dosePerKg: true, weightKg: null })).toThrow(DomainError);
  });

  it('recusa dose por quilo com peso zero ou negativo', () => {
    expect(() => computeDose({ doseValue: 0.1, doseUom: 'mg', dosePerKg: true, weightKg: 0 })).toThrow(DomainError);
    expect(() => computeDose({ doseValue: 0.1, doseUom: 'mg', dosePerKg: true, weightKg: -2 })).toThrow(DomainError);
  });

  it('recusa dose menor ou igual a zero', () => {
    expect(() => computeDose({ doseValue: 0, doseUom: 'mg', dosePerKg: false })).toThrow(DomainError);
  });

  it('funciona com pesos muito pequenos, como o de uma calopsita', () => {
    const result = computeDose({ doseValue: 20, doseUom: 'mg', dosePerKg: true, weightKg: 0.092 });
    expect(result.totalDose).toBeCloseTo(1.84, 4);
  });

  it('funciona com pesos grandes, como o de um bovino', () => {
    const result = computeDose({ doseValue: 2.2, doseUom: 'mg', dosePerKg: true, weightKg: 512 });
    expect(result.totalDose).toBeCloseTo(1126.4, 2);
  });

  it('converte dose em mg para volume quando há concentração em mg/mL', () => {
    const result = computeDose({
      doseValue: 25,
      doseUom: 'mg',
      dosePerKg: true,
      weightKg: 432,
      concentrationValue: 500,
      concentrationUom: 'mg/mL',
    });
    expect(result.totalDose).toBeCloseTo(10800, 1);
    expect(result.administerValue).toBeCloseTo(21.6, 2);
    expect(result.administerUom).toBe('mL');
  });

  it('não inventa volume quando a concentração é incompatível com a unidade da dose', () => {
    const result = computeDose({
      doseValue: 1,
      doseUom: 'tablet',
      dosePerKg: false,
      concentrationValue: 500,
      concentrationUom: 'mg/mL',
    });
    expect(result.administerValue).toBeNull();
  });
});

describe('normalizeIngredient', () => {
  it('remove acento, caixa e pontuação', () => {
    expect(normalizeIngredient('Dipirona Sódica')).toBe('dipirona sodica');
    expect(normalizeIngredient('  AMOXICILINA + clavulanato ')).toBe('amoxicilina clavulanato');
  });

  it('devolve string vazia para entrada vazia', () => {
    expect(normalizeIngredient('')).toBe('');
  });
});

describe('matchAllergies', () => {
  const allergies = [
    { substance: 'Dipirona', normalized: 'dipirona' },
    { substance: 'Amoxicilina', normalized: 'amoxicilina' },
  ];

  it('detecta o princípio ativo mesmo com grafia diferente', () => {
    const matches = matchAllergies(
      [{ drugName: 'Dipirona sódica 500 mg/mL', activeIngredient: 'Dipirona Sódica' }],
      allergies,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]?.substance).toBe('Dipirona');
  });

  it('detecta pelo nome comercial quando o princípio ativo não vem preenchido', () => {
    const matches = matchAllergies([{ drugName: 'Amoxicilina 250 mg', activeIngredient: null }], allergies);
    expect(matches).toHaveLength(1);
  });

  it('não aponta alergia para medicamento diferente', () => {
    const matches = matchAllergies([{ drugName: 'Meloxicam 2 mg', activeIngredient: 'Meloxicam' }], allergies);
    expect(matches).toHaveLength(0);
  });

  it('não quebra com lista de alergias vazia', () => {
    expect(matchAllergies([{ drugName: 'Dipirona', activeIngredient: 'Dipirona' }], [])).toHaveLength(0);
  });

  it('casa por produto quando os dois lados têm o mesmo identificador', () => {
    const matches = matchAllergies(
      [{ drugName: 'Produto X', activeIngredient: null, productId: 'p-1' }],
      [{ substance: 'Produto X', normalized: 'produto x', productId: 'p-1' }],
    );
    expect(matches).toHaveLength(1);
  });
});

describe('posologyLabel', () => {
  it('descreve dose, via, intervalo e duração', () => {
    const dose = computeDose({ doseValue: 0.1, doseUom: 'mg', dosePerKg: true, weightKg: 32.4 });
    const label = posologyLabel({
      dose,
      route: 'oral',
      frequencyKind: 'interval_hours',
      frequencyValue: 24,
      durationDays: 7,
      instructions: 'Administrar após a refeição.',
    });
    expect(label).toContain('mg');
    expect(label).toContain('via oral');
    expect(label).toContain('a cada 24 h');
    expect(label).toContain('por 7 dias');
    expect(label).toContain('Administrar após a refeição.');
  });

  it('omite partes ausentes sem deixar separador solto', () => {
    const label = posologyLabel({ dose: null, route: null, frequencyKind: 'once' });
    expect(label).toBe('dose única');
  });
});
