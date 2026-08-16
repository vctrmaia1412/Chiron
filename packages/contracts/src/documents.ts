import { z } from 'zod';
import { isoDateTimeSchema, paginationQuerySchema, shortTextSchema, uuidSchema } from './common';
import { consentKindSchema, documentKindSchema, documentStatusSchema, documentTargetTypeSchema, virusScanStatusSchema } from './enums';

export const documentSchema = z.object({
  id: uuidSchema,
  kind: documentKindSchema,
  title: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  status: documentStatusSchema,
  virusScanStatus: virusScanStatusSchema,
  createdAt: isoDateTimeSchema,
  uploadedByName: z.string().nullable(),
  links: z.array(z.object({ targetType: documentTargetTypeSchema, targetId: uuidSchema })),
  generatedFrom: z.string().nullable(),
});
export type DocumentDto = z.infer<typeof documentSchema>;

export const ALLOWED_UPLOAD_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const createUploadSchema = z.object({
  kind: documentKindSchema,
  title: shortTextSchema,
  mimeType: z.enum(ALLOWED_UPLOAD_MIME_TYPES),
  sizeBytes: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
  links: z
    .array(z.object({ targetType: documentTargetTypeSchema, targetId: uuidSchema }))
    .min(1)
    .max(5),
});
export type CreateUpload = z.infer<typeof createUploadSchema>;

export const createUploadResponseSchema = z.object({
  documentId: uuidSchema,
  uploadUrl: z.string(),
  method: z.enum(['PUT', 'POST']),
  headers: z.record(z.string(), z.string()),
  expiresInSeconds: z.number().int(),
});

export const completeUploadSchema = z.object({
  sha256: z.string().length(64).optional(),
});

export const DOCUMENT_TEMPLATE_KEYS = [
  'prescription_simple',
  'prescription_controlled',
  'vaccination_card',
  'health_certificate',
  'vaccination_certificate',
  'attendance_statement',
  'referral_letter',
  'death_certificate',
  'consent_treatment',
  'consent_surgery',
  'consent_anesthesia',
  'consent_euthanasia',
  'medical_record',
] as const;
export type DocumentTemplateKey = (typeof DOCUMENT_TEMPLATE_KEYS)[number];

export const generateDocumentSchema = z.object({
  templateKey: z.enum(DOCUMENT_TEMPLATE_KEYS),
  targetType: documentTargetTypeSchema,
  targetId: uuidSchema,
  fields: z.record(z.string(), z.unknown()).default({}),
});
export type GenerateDocument = z.infer<typeof generateDocumentSchema>;

export const listDocumentsQuerySchema = paginationQuerySchema.extend({
  patientId: uuidSchema.optional(),
  encounterId: uuidSchema.optional(),
  kind: documentKindSchema.optional(),
});

export const consentSchema = z.object({
  id: uuidSchema,
  guardianId: uuidSchema,
  guardianName: z.string().nullable(),
  patientId: uuidSchema.nullable(),
  kind: consentKindSchema,
  textVersion: z.string(),
  grantedAt: isoDateTimeSchema,
  revokedAt: isoDateTimeSchema.nullable(),
  method: z.enum(['signed_paper', 'digital_click', 'digital_signature']),
  documentId: uuidSchema.nullable(),
});

export const createConsentSchema = z.object({
  guardianId: uuidSchema,
  patientId: uuidSchema.optional(),
  kind: consentKindSchema,
  textVersion: z.string().trim().max(40).default('v1'),
  method: z.enum(['signed_paper', 'digital_click', 'digital_signature']).default('digital_click'),
  documentId: uuidSchema.optional(),
});
