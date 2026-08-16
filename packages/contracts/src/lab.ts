import { z } from 'zod';
import { isoDateTimeSchema, paginationQuerySchema, queryBoolean, shortTextSchema, uuidSchema } from './common';
import {
  abnormalFlagSchema,
  examCategorySchema,
  examOrderItemStatusSchema,
  examOrderStatusSchema,
  examPrioritySchema,
  examResultStatusSchema,
} from './enums';

export const examCatalogItemSchema = z.object({
  id: uuidSchema,
  code: z.string(),
  name: z.string(),
  category: examCategorySchema,
  specimenKind: z.string().nullable(),
  turnaroundHours: z.number().int().nullable(),
  analytes: z.array(
    z.object({ code: z.string(), name: z.string(), uom: z.string().nullable() }),
  ),
  isGlobal: z.boolean(),
});
export type ExamCatalogItem = z.infer<typeof examCatalogItemSchema>;

export const laboratorySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  isInternal: z.boolean(),
  active: z.boolean(),
});

export const examResultValueSchema = z.object({
  id: uuidSchema,
  analyteCode: z.string(),
  analyteName: z.string(),
  valueNumeric: z.string().nullable(),
  valueText: z.string().nullable(),
  uom: z.string().nullable(),
  refMin: z.string().nullable(),
  refMax: z.string().nullable(),
  abnormalFlag: abnormalFlagSchema.nullable(),
});
export type ExamResultValue = z.infer<typeof examResultValueSchema>;

export const examResultSchema = z.object({
  id: uuidSchema,
  status: examResultStatusSchema,
  reportText: z.string().nullable(),
  interpretation: z.string().nullable(),
  documentId: uuidSchema.nullable(),
  releasedAt: isoDateTimeSchema,
  releasedByName: z.string().nullable(),
  reviewedAt: isoDateTimeSchema.nullable(),
  reviewedByName: z.string().nullable(),
  values: z.array(examResultValueSchema),
});
export type ExamResult = z.infer<typeof examResultSchema>;

export const examOrderItemSchema = z.object({
  id: uuidSchema,
  examCatalogId: uuidSchema,
  examName: z.string(),
  category: examCategorySchema,
  status: examOrderItemStatusSchema,
  collectedAt: isoDateTimeSchema.nullable(),
  laboratoryName: z.string().nullable(),
  result: examResultSchema.nullable(),
});
export type ExamOrderItem = z.infer<typeof examOrderItemSchema>;

export const examOrderSchema = z.object({
  id: uuidSchema,
  number: z.number().int(),
  patient: z.object({ id: uuidSchema, name: z.string(), speciesName: z.string() }),
  encounterId: uuidSchema.nullable(),
  status: examOrderStatusSchema,
  priority: examPrioritySchema,
  clinicalInfo: z.string().nullable(),
  orderedAt: isoDateTimeSchema,
  orderedByName: z.string().nullable(),
  items: z.array(examOrderItemSchema),
});
export type ExamOrder = z.infer<typeof examOrderSchema>;

export const createExamOrderSchema = z.object({
  patientId: uuidSchema,
  encounterId: uuidSchema.optional(),
  priority: examPrioritySchema.default('routine'),
  clinicalInfo: z.string().trim().max(2000).optional(),
  laboratoryId: uuidSchema.optional(),
  items: z
    .array(z.object({ examCatalogId: uuidSchema, laboratoryId: uuidSchema.optional() }))
    .min(1)
    .max(30),
});
export type CreateExamOrder = z.infer<typeof createExamOrderSchema>;

export const submitExamResultSchema = z.object({
  reportText: z.string().trim().max(20000).optional(),
  interpretation: z.string().trim().max(4000).optional(),
  documentId: uuidSchema.optional(),
  status: z.enum(['preliminary', 'final']).default('final'),
  values: z
    .array(
      z.object({
        analyteCode: z.string().trim().min(1).max(60),
        analyteName: shortTextSchema,
        valueNumeric: z.number().optional(),
        valueText: z.string().trim().max(200).optional(),
        uom: z.string().trim().max(20).optional(),
        refMin: z.number().optional(),
        refMax: z.number().optional(),
      }),
    )
    .max(200)
    .default([]),
});
export type SubmitExamResult = z.infer<typeof submitExamResultSchema>;

export const listExamOrdersQuerySchema = paginationQuerySchema.extend({
  status: examOrderStatusSchema.optional(),
  patientId: uuidSchema.optional(),
  encounterId: uuidSchema.optional(),
  pending: queryBoolean.optional(),
});
