import { z } from 'zod';
import { isoDateSchema, isoDateTimeSchema, paginationQuerySchema, shortTextSchema, uuidSchema } from './common';
import { immunizationStatusSchema, preventiveKindSchema, routeSchema } from './enums';

export const immunizationSchema = z.object({
  id: uuidSchema,
  patientId: uuidSchema,
  patientName: z.string().optional(),
  encounterId: uuidSchema.nullable(),
  vaccineName: z.string(),
  manufacturer: z.string().nullable(),
  lotNumber: z.string().nullable(),
  expiresAt: isoDateSchema.nullable(),
  administeredAt: isoDateTimeSchema,
  professionalName: z.string().nullable(),
  route: routeSchema.nullable(),
  site: z.string().nullable(),
  doseNumber: z.number().int().nullable(),
  nextDueAt: isoDateSchema.nullable(),
  status: immunizationStatusSchema,
  reactionNotes: z.string().nullable(),
  documentId: uuidSchema.nullable(),
});
export type Immunization = z.infer<typeof immunizationSchema>;

export const createImmunizationSchema = z.object({
  patientId: uuidSchema,
  encounterId: uuidSchema.optional(),
  vaccineName: shortTextSchema,
  manufacturer: z.string().trim().max(120).optional(),
  lotNumber: z.string().trim().max(60).optional(),
  expiresAt: isoDateSchema.optional(),
  administeredAt: isoDateTimeSchema.optional(),
  route: routeSchema.optional(),
  site: z.string().trim().max(60).optional(),
  doseNumber: z.number().int().min(1).max(20).optional(),
  nextDueAt: isoDateSchema.optional(),
  reactionNotes: z.string().trim().max(1000).optional(),
});
export type CreateImmunization = z.infer<typeof createImmunizationSchema>;

export const preventiveTreatmentSchema = z.object({
  id: uuidSchema,
  patientId: uuidSchema,
  patientName: z.string().optional(),
  encounterId: uuidSchema.nullable(),
  kind: preventiveKindSchema,
  productName: z.string(),
  lotNumber: z.string().nullable(),
  administeredAt: isoDateTimeSchema,
  professionalName: z.string().nullable(),
  doseText: z.string().nullable(),
  nextDueAt: isoDateSchema.nullable(),
  notes: z.string().nullable(),
});
export type PreventiveTreatment = z.infer<typeof preventiveTreatmentSchema>;

export const createPreventiveTreatmentSchema = z.object({
  patientId: uuidSchema,
  encounterId: uuidSchema.optional(),
  kind: preventiveKindSchema,
  productName: shortTextSchema,
  lotNumber: z.string().trim().max(60).optional(),
  administeredAt: isoDateTimeSchema.optional(),
  doseText: z.string().trim().max(120).optional(),
  nextDueAt: isoDateSchema.optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const dueItemSchema = z.object({
  kind: z.enum(['vaccine', 'preventive']),
  id: uuidSchema,
  patientId: uuidSchema,
  patientName: z.string(),
  guardianName: z.string().nullable(),
  guardianPhone: z.string().nullable(),
  productName: z.string(),
  dueAt: isoDateSchema,
});
export type DueItem = z.infer<typeof dueItemSchema>;

export const listDueQuerySchema = paginationQuerySchema.extend({
  until: isoDateSchema.optional(),
});
