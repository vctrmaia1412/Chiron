import { describe, expect, it } from 'vitest';
import { isValidGtin, parseIdentifier } from './identifiers';
import { DomainError } from './errors';

const GS = String.fromCharCode(29);

describe('parseIdentifier', () => {
  it('reconhece microchip ISO de 15 dígitos', () => {
    const parsed = parseIdentifier('981098104523771');
    expect(parsed.kind).toBe('microchip');
    expect(parsed.raw).toBe('981098104523771');
  });

  it('reconhece código de barras GTIN-13', () => {
    const parsed = parseIdentifier('7891234567895');
    expect(parsed.kind).toBe('gtin');
    expect(parsed.gtin).toHaveLength(14);
  });

  it('reconhece URL de QR code', () => {
    expect(parseIdentifier('https://exemplo.dev/p/123').kind).toBe('url');
  });

  it('extrai GTIN, lote, validade e série de um GS1', () => {
    const raw = `0107891234567895${GS}10LT2026A${GS}17270131${GS}21SER-9`;
    const parsed = parseIdentifier(raw);
    expect(parsed.kind).toBe('gs1');
    expect(parsed.gtin).toBe('07891234567895');
    expect(parsed.lot).toBe('LT2026A');
    expect(parsed.expiry).toBe('2027-01-31');
    expect(parsed.serial).toBe('SER-9');
  });

  it('reconhece código interno com prefixo', () => {
    const parsed = parseIdentifier('PAC-2026-0042');
    expect(parsed.kind).toBe('internal');
    expect(parsed.internalCode).toBe('PAC-2026-0042');
  });

  it('devolve desconhecido em vez de adivinhar', () => {
    expect(parseIdentifier('texto qualquer aqui').kind).toBe('unknown');
  });

  it('recusa código vazio', () => {
    expect(() => parseIdentifier('   ')).toThrow(DomainError);
  });
});

describe('isValidGtin', () => {
  it('valida o dígito verificador', () => {
    expect(isValidGtin('7891234567895')).toBe(true);
    expect(isValidGtin('7891234567891')).toBe(false);
  });

  it('recusa comprimento inválido', () => {
    expect(isValidGtin('12345')).toBe(false);
  });
});
