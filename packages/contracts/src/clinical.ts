import { z } from 'zod';
import {
  isoDateSchema,
  isoDateTimeSchema,
  paginationQuerySchema,
  shortTextSchema,
  uuidSchema,
  queryBoolean,
} from './common';
import {
  abnormalFlagSchema,
  chargeStatusSchema,
  diagnosisKindSchema,
  doseUomSchema,
  encounterClassSchema,
  encounterDispositionSchema,
  encounterStatusSchema,
  frequencyKindSchema,
  noteKindSchema,
  noteStatusSchema,
  prescriptionKindSchema,
  prescriptionStatusSchema,
  routeSchema,
  sensitivitySchema,
  timelineEventKindSchema,
} from './enums';

// ------------------------------------------------------------ encounters
export const encounterSummarySchema = z.object({
  id: uuidSchema,
  number: z.number().int(),
  facilityId: uuidSchema,
  patient: z.object({
    id: uuidSchema,
    name: z.string(),
    speciesName: z.string(),
    breedName: z.string().nullable(),
    ageLabel: z.string().nullable(),
    currentWeightKg: z.string().nullable(),
  }),
  guardianName: z.string().nullable(),
  class: encounterClassSchema,
  status: encounterStatusSchema,
  serviceName: z.string().nullable(),
  attendingProfessional: z.object({ id: uuidSchema, name: z.string() }).nullable(),
  appointmentId: uuidSchema.nullable(),
  arrivedAt: isoDateTimeSchema.nullable(),
  startedAt: isoDateTimeSchema.nullable(),
  endedAt: isoDateTimeSchema.nullable(),
  chiefComplaint: z.string().nullable(),
  primaryDiagnosisSummary: z.string().nullable(),
  disposition: encounterDispositionSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
export type EncounterSummary = z.infer<typeof encounterSummarySchema>;

export const encounterNoteSchema = z.object({
  id: uuidSchema,
  encounterId: uuidSchema,
  kind: noteKindSchema,
  title: z.string().nullable(),
  body: z.string(),
  structured: z.record(z.string(), z.unknown()).nullable(),
  status: noteStatusSchema,
  author: z.object({ id: uuidSchema, name: z.string() }).nullable(),
  signedAt: isoDateTimeSchema.nullable(),
  supersedesNoteId: uuidSchema.nullable(),
  supersededByNoteId: uuidSchema.nullable(),
  version: z.number().int(),
  occurredAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
});
export type EncounterNote = z.infer<typeof encounterNoteSchema>;

export const observationSchema = z.object({
  id: uuidSchema,
  code: z.string(),
  codeName: z.string(),
  valueNumeric: z.string().nullable(),
  valueText: z.string().nullable(),
  valueCode: z.string().nullable(),
  uom: z.string().nullable(),
  enteredValue: z.string().nullable(),
  enteredUom: z.string().nullable(),
  measuredAt: isoDateTimeSchema,
  measuredByName: z.string().nullable(),
  abnormalFlag: abnormalFlagSchema.nullable(),
  abnormalFlagStatus: z.enum(['informational', 'validated']).nullable(),
  referenceMin: z.string().nullable(),
  referenceMax: z.string().nullable(),
  encounterId: uuidSchema.nullable(),
  notes: z.string().nullable(),
});
export type Observation = z.infer<typeof observationSchema>;

export const diagnosisSchema = z.object({
  id: uuidSchema,
  description: z.string(),
  conditionId: uuidSchema.nullable(),
  kind: diagnosisKindSchema,
  rank: z.number().int(),
  notes: z.string().nullable(),
  recordedAt: isoDateTimeSchema,
  recordedByName: z.string().nullable(),
});
export type Diagnosis = z.infer<typeof diagnosisSchema>;

export const encounterProcedureSchema = z.object({
  id: uuidSchema,
  description: z.string(),
  serviceId: uuidSchema.nullable(),
  serviceName: z.string().nullable(),
  performedAt: isoDateTimeSchema,
  performedByName: z.string().nullable(),
  notes: z.string().nullable(),
});

export const chargeItemSchema = z.object({
  id: uuidSchema,
  description: z.string(),
  quantity: z.string(),
  unitPrice: z.string().nullable(),
  total: z.string().nullable(),
  status: chargeStatusSchema,
  origin: z.string(),
  occurredAt: isoDateTimeSchema,
});
export type ChargeItem = z.infer<typeof chargeItemSchema>;

export const encounterDetailSchema = encounterSummarySchema.extend({
  notes: z.array(encounterNoteSchema),
  observations: z.array(observationSchema),
  diagnoses: z.array(diagnosisSchema),
  procedures: z.array(encounterProcedureSchema),
  weightKg: z.string().nullable(),
  followUpDueAt: isoDateSchema.nullable(),
  followUpReason: z.string().nullable(),
  followUpAppointmentId: uuidSchema.nullable(),
  referral: z
    .object({ to: z.string(), reason: z.string(), notes: z.string().nullable() })
    .nullable(),
  integrityHash: z.string().nullable(),
  finishedByName: z.string().nullable(),
  reopenedAt: isoDateTimeSchema.nullable(),
  reopenReason: z.string().nullable(),
  version: z.number().int(),
  /** Preenchido quando o usuário não tem `record:read_sensitive`. */
  redacted: z.boolean().default(false),
});
export type EncounterDetail = z.infer<typeof encounterDetailSchema>;

export const createEncounterSchema = z.object({
  patientId: uuidSchema,
  facilityId: uuidSchema.optional(),
  appointmentId: uuidSchema.optional(),
  serviceId: uuidSchema.optional(),
  class: encounterClassSchema.default('outpatient'),
  attendingProfessionalId: uuidSchema.optional(),
  chiefComplaint: z.string().trim().max(500).optional(),
  followUpOfEncounterId: uuidSchema.optional(),
});
export type CreateEncounter = z.infer<typeof createEncounterSchema>;

export const upsertNoteSchema = z.object({
  kind: noteKindSchema,
  title: z.string().trim().max(160).optional(),
  body: z.string().max(50000),
  structured: z.record(z.string(), z.unknown()).optional(),
  expectedVersion: z.number().int().optional(),
});
export type UpsertNote = z.infer<typeof upsertNoteSchema>;

export const amendNoteSchema = z.object({
  body: z.string().min(1).max(50000),
  reason: z.string().trim().min(3).max(300),
});

export const recordObservationsSchema = z.object({
  measuredAt: isoDateTimeSchema.optional(),
  items: z
    .array(
      z.object({
        code: z.string().trim().min(2).max(60),
        value: z.union([z.number(), z.string()]),
        uom: z.string().trim().max(20).optional(),
        method: z.string().trim().max(60).optional(),
        notes: z.string().trim().max(500).optional(),
      }),
    )
    .min(1)
    .max(40),
});
export type RecordObservations = z.infer<typeof recordObservationsSchema>;

export const createDiagnosisSchema = z.object({
  description: shortTextSchema,
  conditionId: uuidSchema.optional(),
  kind: diagnosisKindSchema.default('presumptive'),
  rank: z.number().int().min(1).max(20).default(1),
  notes: z.string().trim().max(1000).optional(),
});

export const createProcedureSchema = z.object({
  description: shortTextSchema,
  serviceId: uuidSchema.optional(),
  performedAt: isoDateTimeSchema.optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const finishEncounterSchema = z.object({
  disposition: encounterDispositionSchema.default('discharged'),
  followUpDueAt: isoDateSchema.optional(),
  followUpReason: z.string().trim().max(300).optional(),
  referral: z
    .object({
      to: shortTextSchema,
      reason: shortTextSchema,
      notes: z.string().trim().max(2000).optional(),
    })
    .optional(),
  expectedVersion: z.number().int().optional(),
  /** Justificativa quando não há avaliação nem diagnóstico (consulta). */
  minimumContentJustification: z.string().trim().max(300).optional(),
});
export type FinishEncounter = z.infer<typeof finishEncounterSchema>;

export const reopenEncounterSchema = z.object({ reason: z.string().trim().min(5).max(300) });
export const cancelEncounterSchema = z.object({ reason: z.string().trim().min(3).max(300) });

export const listEncountersQuerySchema = paginationQuerySchema.extend({
  status: encounterStatusSchema.optional(),
  facilityId: uuidSchema.optional(),
  patientId: uuidSchema.optional(),
  professionalId: uuidSchema.optional(),
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
  q: z.string().trim().max(120).optional(),
  open: queryBoolean.optional(),
});

// ----------------------------------------------------------- prescription
export const prescriptionItemSchema = z.object({
  id: uuidSchema,
  seq: z.number().int(),
  productId: uuidSchema.nullable(),
  drugName: z.string(),
  activeIngredient: z.string().nullable(),
  concentration: z.string().nullable(),
  doseValue: z.string().nullable(),
  doseUom: doseUomSchema.nullable(),
  dosePerKg: z.boolean(),
  computedDoseValue: z.string().nullable(),
  route: routeSchema.nullable(),
  frequencyKind: frequencyKindSchema.nullable(),
  frequencyValue: z.string().nullable(),
  durationDays: z.number().int().nullable(),
  quantity: z.string().nullable(),
  quantityUom: z.string().nullable(),
  instructions: z.string().nullable(),
  isControlled: z.boolean(),
  withdrawalMeatDays: z.number().int().nullable(),
  withdrawalMilkDays: z.number().int().nullable(),
  extraLabel: z.boolean(),
});
export type PrescriptionItem = z.infer<typeof prescriptionItemSchema>;

export const prescriptionSchema = z.object({
  id: uuidSchema,
  number: z.number().int(),
  patientId: uuidSchema,
  patientName: z.string(),
  encounterId: uuidSchema.nullable(),
  kind: prescriptionKindSchema,
  status: prescriptionStatusSchema,
  prescriber: z.object({ id: uuidSchema, name: z.string(), council: z.string().nullable() }).nullable(),
  issuedAt: isoDateTimeSchema.nullable(),
  signedAt: isoDateTimeSchema.nullable(),
  validUntil: isoDateSchema.nullable(),
  documentId: uuidSchema.nullable(),
  notes: z.string().nullable(),
  items: z.array(prescriptionItemSchema),
  createdAt: isoDateTimeSchema,
});
export type Prescription = z.infer<typeof prescriptionSchema>;

export const prescriptionItemInputSchema = z.object({
  productId: uuidSchema.optional(),
  drugName: shortTextSchema,
  activeIngredient: z.string().trim().max(160).optional(),
  concentration: z.string().trim().max(60).optional(),
  doseValue: z.number().positive().max(100000).optional(),
  doseUom: doseUomSchema.optional(),
  dosePerKg: z.boolean().default(false),
  route: routeSchema.optional(),
  frequencyKind: frequencyKindSchema.optional(),
  frequencyValue: z.number().positive().max(1000).optional(),
  durationDays: z.number().int().min(1).max(400).optional(),
  quantity: z.number().positive().max(100000).optional(),
  quantityUom: z.string().trim().max(20).optional(),
  instructions: z.string().trim().max(1000).optional(),
  isControlled: z.boolean().default(false),
  withdrawalMeatDays: z.number().int().min(0).max(400).optional(),
  withdrawalMilkDays: z.number().int().min(0).max(400).optional(),
  extraLabel: z.boolean().default(false),
  extraLabelJustification: z.string().trim().max(500).optional(),
});
export type PrescriptionItemInput = z.infer<typeof prescriptionItemInputSchema>;

export const createPrescriptionSchema = z.object({
  patientId: uuidSchema,
  encounterId: uuidSchema.optional(),
  notes: z.string().trim().max(2000).optional(),
  validUntil: isoDateSchema.optional(),
  items: z.array(prescriptionItemInputSchema).min(1).max(30),
});
export type CreatePrescription = z.infer<typeof createPrescriptionSchema>;

export const signPrescriptionSchema = z.object({
  allergiesReviewed: z.literal(true, {
    message: 'É necessário confirmar a revisão das alergias antes de assinar',
  }),
});

// -------------------------------------------------------------- timeline
export const timelineItemSchema = z.object({
  id: z.string(),
  kind: timelineEventKindSchema,
  occurredAt: isoDateTimeSchema,
  title: z.string(),
  summary: z.string().nullable(),
  sensitivity: sensitivitySchema,
  encounterId: uuidSchema.nullable(),
  sourceTable: z.string(),
  sourceId: uuidSchema,
  actorName: z.string().nullable(),
});
export type TimelineItem = z.infer<typeof timelineItemSchema>;

export const listTimelineQuerySchema = paginationQuerySchema.extend({
  kinds: z.string().optional(),
});

// ------------------------------------------------------------- prontuário
export const medicalRecordEncounterSchema = z.object({
  encounter: encounterSummarySchema,
  notes: z.array(encounterNoteSchema),
  diagnoses: z.array(diagnosisSchema),
  observations: z.array(observationSchema),
  prescriptions: z.array(prescriptionSchema),
  examOrderIds: z.array(uuidSchema),
});

export const medicalRecordSchema = z.object({
  patientId: uuidSchema,
  encounters: z.array(medicalRecordEncounterSchema),
  redacted: z.boolean(),
});
export type MedicalRecord = z.infer<typeof medicalRecordSchema>;
