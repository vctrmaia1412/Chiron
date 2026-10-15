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
  /** Dose aplicada fora da clínica (histórico trazido pelo tutor). */
  administeredElsewhere: z.boolean(),
  externalLocation: z.string().nullable(),
  externalProfessional: z.string().nullable(),
  cancelReason: z.string().nullable(),
  cancelledAt: isoDateTimeSchema.nullable(),
});
export type Immunization = z.infer<typeof immunizationSchema>;

/**
 * Dose aplicada em outro local: sem atendimento, sem profissional da casa e
 * com a data obrigatória (o servidor confere), porque é a data da carteira.
 */
const elsewhereFields = {
  administeredElsewhere: z.boolean().optional(),
  externalLocation: z.string().trim().max(160).optional(),
  externalProfessional: z.string().trim().max(160).optional(),
};

export const createImmunizationSchema = z.object({
  patientId: uuidSchema,
  encounterId: uuidSchema.optional(),
  protocolId: uuidSchema.optional(),
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
  ...elsewhereFields,
});
export type CreateImmunization = z.infer<typeof createImmunizationSchema>;

/**
 * Correção de dose registrada. Campo ausente fica como está; `null` apaga
 * (ex.: não há próxima dose). Nome da vacina não se corrige: vacina errada é
 * cancelar e registrar de novo, para o histórico mostrar as duas coisas.
 */
export const updateImmunizationSchema = z.object({
  administeredAt: isoDateTimeSchema.optional(),
  doseNumber: z.number().int().min(1).max(20).nullish(),
  manufacturer: z.string().trim().max(120).nullish(),
  lotNumber: z.string().trim().max(60).nullish(),
  expiresAt: isoDateSchema.nullish(),
  nextDueAt: isoDateSchema.nullish(),
  reactionNotes: z.string().trim().max(1000).nullish(),
  externalLocation: z.string().trim().max(160).nullish(),
  externalProfessional: z.string().trim().max(160).nullish(),
});
export type UpdateImmunization = z.infer<typeof updateImmunizationSchema>;

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
  status: immunizationStatusSchema,
  administeredElsewhere: z.boolean(),
  externalLocation: z.string().nullable(),
  externalProfessional: z.string().nullable(),
  cancelReason: z.string().nullable(),
  cancelledAt: isoDateTimeSchema.nullable(),
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
  ...elsewhereFields,
});
export type CreatePreventiveTreatment = z.infer<typeof createPreventiveTreatmentSchema>;

/** Mesma regra da vacina: ausente fica, `null` apaga, produto não se troca. */
export const updatePreventiveTreatmentSchema = z.object({
  administeredAt: isoDateTimeSchema.optional(),
  lotNumber: z.string().trim().max(60).nullish(),
  doseText: z.string().trim().max(120).nullish(),
  nextDueAt: isoDateSchema.nullish(),
  notes: z.string().trim().max(1000).nullish(),
  externalLocation: z.string().trim().max(160).nullish(),
  externalProfessional: z.string().trim().max(160).nullish(),
});
export type UpdatePreventiveTreatment = z.infer<typeof updatePreventiveTreatmentSchema>;

/** Cancelar é marcar como registro em erro: o motivo é obrigatório e fica no histórico. */
export const cancelImmunizationRecordSchema = z.object({
  reason: z.string().trim().min(3, 'Informe o motivo do cancelamento.').max(300),
});
export type CancelImmunizationRecord = z.infer<typeof cancelImmunizationRecordSchema>;

export const dueItemSchema = z.object({
  kind: z.enum(['vaccine', 'preventive']),
  id: uuidSchema,
  patientId: uuidSchema,
  patientName: z.string(),
  guardianName: z.string().nullable(),
  guardianPhone: z.string().nullable(),
  productName: z.string(),
  /** Tipo do preventivo, para registrar a próxima aplicação já no tipo certo. */
  preventiveKind: preventiveKindSchema.nullable(),
  dueAt: isoDateSchema,
});
export type DueItem = z.infer<typeof dueItemSchema>;

export const listDueQuerySchema = paginationQuerySchema.extend({
  until: isoDateSchema.optional(),
});
