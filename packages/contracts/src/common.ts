import { z } from 'zod';

export const uuidSchema = z.string().uuid();
export const isoDateTimeSchema = z.string().datetime({ offset: true });
/** Data civil (nascimento, validade): sem fuso. */
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato AAAA-MM-DD');

/** Dinheiro trafega como string decimal com duas casas (mapeia para numeric(14,2)). */
export const moneySchema = z
  .string()
  .regex(/^-?\d{1,12}(\.\d{1,2})?$/, 'Valor monetário inválido')
  .describe('Decimal com até duas casas, como "120.50"');

export const decimalSchema = z
  .string()
  .regex(/^-?\d{1,12}(\.\d{1,4})?$/, 'Número decimal inválido')
  .describe('Decimal com até quatro casas');

/**
 * Booleano vindo de query string. `z.coerce.boolean()` não serve: ele usa
 * `Boolean(valor)`, e a string "false" é verdadeira, o que inverte o filtro
 * sem avisar.
 */
export const queryBoolean = z
  .union([z.boolean(), z.string()])
  .transform((value) =>
    typeof value === 'boolean' ? value : ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase()),
  );

export const paginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export function pageSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
    total: z.number().int().nonnegative().optional(),
  });
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  total?: number;
}

export const okSchema = z.object({ ok: z.literal(true) });

export const idParamSchema = z.object({ id: uuidSchema });

/** Telefone brasileiro em formato livre, guardado normalizado (só dígitos). */
export const phoneSchema = z
  .string()
  .trim()
  .min(8)
  .max(20)
  .transform((v) => v.replace(/\D/g, ''));

export const emailSchema = z.string().trim().toLowerCase().email().max(320);

export const shortTextSchema = z.string().trim().min(1).max(200);
export const mediumTextSchema = z.string().trim().min(1).max(2000);
export const longTextSchema = z.string().trim().min(1).max(20000);

export const nameSchema = z.string().trim().min(2).max(160);

/** Documento (CPF/CNPJ) apenas com dígitos. */
export const documentNumberSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v.length === 11 || v.length === 14, 'CPF deve ter 11 dígitos e CNPJ 14');

function checkDigit(digits: number[], weights: number[]): number {
  const sum = digits.reduce((total, digit, index) => total + digit * weights[index]!, 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

/** CPF com dígitos verificadores corretos (aceita com ou sem máscara). */
export function isValidCpf(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  const numbers = [...digits].map(Number);
  const first = checkDigit(numbers.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checkDigit(numbers.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return first === numbers[9] && second === numbers[10];
}

/** CNPJ com dígitos verificadores corretos (aceita com ou sem máscara). */
export function isValidCnpj(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;
  const numbers = [...digits].map(Number);
  const first = checkDigit(numbers.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checkDigit(numbers.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return first === numbers[12] && second === numbers[13];
}

export type IdentityDocumentKind = 'cpf' | 'cnpj' | 'passport' | 'none';

/**
 * Normaliza o documento conforme o tipo: CPF e CNPJ ficam só com dígitos,
 * passaporte mantém letras (em maiúsculas). Devolve a mensagem de erro em
 * português quando não confere, ou o valor normalizado.
 */
export function normalizeDocument(kind: IdentityDocumentKind, value: string): { value: string } | { error: string } {
  const raw = value.trim();
  if (kind === 'cpf') {
    return isValidCpf(raw) ? { value: raw.replace(/\D/g, '') } : { error: 'CPF inválido. Confira os 11 dígitos.' };
  }
  if (kind === 'cnpj') {
    return isValidCnpj(raw) ? { value: raw.replace(/\D/g, '') } : { error: 'CNPJ inválido. Confira os 14 dígitos.' };
  }
  if (kind === 'passport') {
    const compact = raw.replace(/[\s.-]/g, '').toUpperCase();
    return /^[A-Z0-9]{5,20}$/.test(compact)
      ? { value: compact }
      : { error: 'Passaporte deve ter de 5 a 20 letras ou números.' };
  }
  return { error: 'Escolha o tipo de documento antes de informar o número.' };
}

export const addressSchema = z.object({
  zipCode: z.string().trim().max(12).optional(),
  street: z.string().trim().max(200).optional(),
  number: z.string().trim().max(20).optional(),
  complement: z.string().trim().max(120).optional(),
  district: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().length(2).optional(),
  country: z.string().trim().max(60).default('BR').optional(),
});
export type Address = z.infer<typeof addressSchema>;

export const sortDirectionSchema = z.enum(['asc', 'desc']).default('desc');
