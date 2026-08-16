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
