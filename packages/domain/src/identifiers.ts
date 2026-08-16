import { DomainError } from './errors';

/**
 * Leitura de identificadores (código de barras, microchip).
 * O parse é local e determinístico; a resolução semântica é do backend.
 */
export type IdentifierKind = 'gtin' | 'gs1' | 'internal' | 'microchip' | 'url' | 'unknown';

export interface ParsedIdentifier {
  kind: IdentifierKind;
  raw: string;
  gtin?: string;
  lot?: string;
  expiry?: string;
  serial?: string;
  internalCode?: string;
}

const GS = String.fromCharCode(29);

export function parseIdentifier(raw: string): ParsedIdentifier {
  const value = raw.trim();
  if (!value) throw new DomainError('VALIDATION_FAILED', 'Código vazio.');

  if (/^https?:\/\//i.test(value)) return { kind: 'url', raw: value };

  // GS1 Application Identifiers
  if (value.includes(GS) || /^01\d{14}/.test(value)) return parseGs1(value);

  const digits = value.replace(/\D/g, '');
  if (digits.length === 15 && digits === value) return { kind: 'microchip', raw: value };
  if ((digits.length === 13 || digits.length === 12 || digits.length === 8) && digits === value) {
    return { kind: 'gtin', raw: value, gtin: digits.padStart(14, '0') };
  }
  if (/^[A-Z]{2,5}-[A-Z0-9-]{3,}$/i.test(value)) return { kind: 'internal', raw: value, internalCode: value.toUpperCase() };
  return { kind: 'unknown', raw: value };
}

function parseGs1(value: string): ParsedIdentifier {
  const result: ParsedIdentifier = { kind: 'gs1', raw: value };
  let rest = value;
  const fixedLength: Record<string, number> = { '01': 14, '17': 6, '11': 6, '15': 6 };
  while (rest.length >= 2) {
    const ai = rest.slice(0, 2);
    rest = rest.slice(2);
    const fixed = fixedLength[ai];
    let data: string;
    if (fixed) {
      data = rest.slice(0, fixed);
      rest = rest.slice(fixed);
    } else {
      const idx = rest.indexOf(GS);
      data = idx >= 0 ? rest.slice(0, idx) : rest;
      rest = idx >= 0 ? rest.slice(idx + 1) : '';
    }
    if (ai === '01') result.gtin = data;
    else if (ai === '10') result.lot = data;
    else if (ai === '17') result.expiry = expandGs1Date(data);
    else if (ai === '21') result.serial = data;
    if (rest.startsWith(GS)) rest = rest.slice(1);
  }
  return result;
}

function expandGs1Date(yymmdd: string): string | undefined {
  if (yymmdd.length !== 6) return undefined;
  const yy = Number(yymmdd.slice(0, 2));
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6) === '00' ? '01' : yymmdd.slice(4, 6);
  const year = yy >= 51 ? 1900 + yy : 2000 + yy;
  return `${year}-${mm}-${dd}`;
}

/** Valida o dígito verificador de um GTIN/EAN. */
export function isValidGtin(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (![8, 12, 13, 14].includes(digits.length)) return false;
  const nums = digits.split('').map(Number);
  const check = nums.pop() as number;
  const sum = nums
    .reverse()
    .reduce((acc, n, i) => acc + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}
