import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatTime, formatWeekday, isToday, toIsoDate } from './format';

describe('ambiente do teste', () => {
  it('roda em America/Sao_Paulo', () => {
    // Sem o fuso fixo, todas as asserções abaixo passariam por acidente em UTC.
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('America/Sao_Paulo');
  });
});

describe('formatDate', () => {
  it('mantém o dia de uma data sem hora', () => {
    expect(formatDate('2025-03-10')).toBe('10/03/2025');
  });

  it('mantém o dia na virada de mês e de ano, onde o deslocamento é mais visível', () => {
    expect(formatDate('2025-01-01')).toBe('01/01/2025');
    expect(formatDate('2024-12-31')).toBe('31/12/2024');
  });

  it('formata timestamp com hora no fuso local', () => {
    // 12:30 UTC do dia 10 é 09:30 do dia 10 em Sao Paulo.
    expect(formatDate('2025-03-10T12:30:00.000Z')).toBe('10/03/2025');
  });

  it('mantém a conversão de fuso do timestamp de madrugada', () => {
    // 01:00 UTC do dia 11 ainda é 22:00 do dia 10 em Sao Paulo.
    expect(formatDate('2025-03-11T01:00:00.000Z')).toBe('10/03/2025');
  });

  it('aceita Date', () => {
    expect(formatDate(new Date(2025, 2, 10))).toBe('10/03/2025');
  });

  it('devolve vazio para nulo, indefinido e string vazia', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
    expect(formatDate('')).toBe('');
  });

  it('devolve vazio para valor inválido', () => {
    expect(formatDate('sem data')).toBe('');
    expect(formatDate('2025-02-31')).toBe('');
    expect(formatDate('2025-13-01')).toBe('');
  });
});

describe('formatTime e formatDateTime', () => {
  it('mostra a hora convertida para o fuso local', () => {
    expect(formatTime('2025-03-10T12:30:00.000Z')).toBe('09:30');
  });

  it('mostra data e hora do mesmo instante', () => {
    const formatted = formatDateTime('2025-03-10T12:30:00.000Z');
    expect(formatted).toContain('10/03/2025');
    expect(formatted).toContain('09:30');
  });

  it('devolve vazio para nulo e para valor inválido', () => {
    expect(formatTime(null)).toBe('');
    expect(formatDateTime(null)).toBe('');
    expect(formatDateTime('sem data')).toBe('');
  });
});

describe('formatWeekday', () => {
  it('usa o dia da semana da data local, não o do UTC', () => {
    // 10/03/2025 é segunda; lido como UTC viraria domingo no Brasil.
    expect(formatWeekday('2025-03-10').toLowerCase()).toContain('segunda');
  });

  it('devolve vazio para nulo', () => {
    expect(formatWeekday(null)).toBe('');
  });
});

describe('isToday', () => {
  it('reconhece a data de hoje serializada sem hora', () => {
    expect(isToday(toIsoDate(new Date()))).toBe(true);
  });

  it('devolve falso para nulo', () => {
    expect(isToday(null)).toBe(false);
  });
});
