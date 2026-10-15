import { z } from 'zod';
import { isoDateSchema, isoDateTimeSchema, shortTextSchema, uuidSchema } from './common';
import { doseUomSchema, frequencyKindSchema, problemStatusSchema, routeSchema } from './enums';
import { prescriptionItemInputSchema } from './clinical';
import { patientProblemSchema } from './registry';

/**
 * Apoio ao registro rápido: modelos, atalhos, diagnósticos do catálogo,
 * problemas do paciente, resumo para a consulta e sugestões a partir do que a
 * própria clínica já prescreveu. Tudo aqui existe para o veterinário digitar
 * menos, nunca para exigir mais campos.
 */

// ------------------------------------------------------------- modelos
/** Seções do registro clínico que um modelo pode preencher. */
export const CHARTING_SECTIONS = ['chief_complaint', 'history', 'physical_exam', 'assessment', 'plan'] as const;
export const chartingSectionSchema = z.enum(CHARTING_SECTIONS);
export type ChartingSection = z.infer<typeof chartingSectionSchema>;

export const noteTemplateKindSchema = z.enum(['template', 'snippet']);

export const noteTemplateSchema = z.object({
  id: uuidSchema,
  scope: z.enum(['global', 'tenant']),
  /** `template` preenche várias seções; `snippet` insere um trecho onde está o cursor. */
  kind: noteTemplateKindSchema,
  name: z.string(),
  /** Atalho digitado depois da barra, sem a barra: `otite` vira `/otite`. */
  shortcut: z.string().nullable(),
  speciesId: uuidSchema.nullable(),
  serviceCategories: z.array(z.string()),
  /** Palavras da queixa que fazem a tela sugerir este modelo ("orelha" sugere otite). */
  keywords: z.array(z.string()),
  sections: z.partialRecord(chartingSectionSchema, z.string()),
  body: z.string().nullable(),
});
export type NoteTemplate = z.infer<typeof noteTemplateSchema>;

const shortcutSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9-]{2,24}$/, 'Atalho com 2 a 24 letras, números ou hífen, sem espaço');

export const createNoteTemplateSchema = z
  .object({
    kind: noteTemplateKindSchema.default('template'),
    name: shortTextSchema,
    shortcut: shortcutSchema.optional(),
    speciesId: uuidSchema.optional(),
    sections: z.partialRecord(chartingSectionSchema, z.string().max(20000)).default({}),
    body: z.string().max(20000).optional(),
  })
  .refine(
    (value) =>
      value.kind === 'snippet'
        ? Boolean(value.body?.trim())
        : Object.values(value.sections).some((text) => Boolean(text?.trim())),
    { message: 'O modelo está vazio.' },
  );
export type CreateNoteTemplate = z.infer<typeof createNoteTemplateSchema>;

export const listNoteTemplatesQuerySchema = z.object({
  speciesId: uuidSchema.optional(),
});

// ----------------------------------------------------------- diagnósticos
export const conditionSuggestionSchema = z.object({
  /** Nulo quando a sugestão vem do histórico de texto livre da clínica. */
  id: uuidSchema.nullable(),
  name: z.string(),
  source: z.enum(['catalog', 'history']),
});
export type ConditionSuggestion = z.infer<typeof conditionSuggestionSchema>;

export const searchConditionsQuerySchema = z.object({
  q: z.string().trim().max(120).default(''),
  speciesId: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(30).default(12),
});

// ------------------------------------------------------------- problemas
export const createPatientProblemSchema = z.object({
  description: shortTextSchema,
  conditionId: uuidSchema.optional(),
  status: problemStatusSchema.default('active'),
  sourceEncounterId: uuidSchema.optional(),
});
export type CreatePatientProblem = z.infer<typeof createPatientProblemSchema>;

export const updatePatientProblemSchema = z.object({
  status: problemStatusSchema,
});

// ----------------------------------------------------- resumo do paciente
export const activeMedicationSchema = z.object({
  prescriptionId: uuidSchema,
  drugName: z.string(),
  posology: z.string(),
  prescribedAt: isoDateTimeSchema,
  /** Fim previsto do tratamento; nulo para uso contínuo ou sem duração. */
  until: isoDateSchema.nullable(),
  continuous: z.boolean(),
});
export type ActiveMedication = z.infer<typeof activeMedicationSchema>;

export const patientClinicalSummarySchema = z.object({
  patientId: uuidSchema,
  problems: z.array(patientProblemSchema),
  activeMedications: z.array(activeMedicationSchema),
  lastEncounter: z
    .object({
      id: uuidSchema,
      occurredAt: isoDateTimeSchema,
      serviceName: z.string().nullable(),
      professionalName: z.string().nullable(),
      diagnosisSummary: z.string().nullable(),
      plan: z.string().nullable(),
    })
    .nullable(),
  dueImmunizations: z.array(
    z.object({
      kind: z.enum(['vaccine', 'preventive']),
      name: z.string(),
      dueAt: isoDateSchema,
      overdue: z.boolean(),
    }),
  ),
  encounterCount: z.number().int(),
  /** Verdadeiro quando o usuário não tem `record:read_sensitive`: conduta e diagnóstico saem ocultos. */
  redacted: z.boolean(),
});
export type PatientClinicalSummary = z.infer<typeof patientClinicalSummarySchema>;

export const patientSummaryQuerySchema = z.object({
  /** Atendimento em curso, excluído de "última consulta". */
  excludeEncounterId: uuidSchema.optional(),
});

// ----------------------------------------------------- receita: sugestões
export const medicationSuggestionSchema = z.object({
  drugName: z.string(),
  activeIngredient: z.string().nullable(),
  concentration: z.string().nullable(),
  doseValue: z.string().nullable(),
  doseUom: doseUomSchema.nullable(),
  dosePerKg: z.boolean(),
  route: routeSchema.nullable(),
  frequencyKind: frequencyKindSchema.nullable(),
  frequencyValue: z.string().nullable(),
  durationDays: z.number().int().nullable(),
  quantityUom: z.string().nullable(),
  instructions: z.string().nullable(),
  isControlled: z.boolean(),
  withdrawalMeatDays: z.number().int().nullable(),
  withdrawalMilkDays: z.number().int().nullable(),
  timesUsed: z.number().int(),
  sameSpecies: z.boolean(),
});
export type MedicationSuggestion = z.infer<typeof medicationSuggestionSchema>;

export const medicationSuggestionsQuerySchema = z.object({
  q: z.string().trim().max(120).default(''),
  speciesId: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

export const prescriptionTemplateSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  speciesId: uuidSchema.nullable(),
  items: z.array(prescriptionItemInputSchema),
  createdAt: isoDateTimeSchema,
});
export type PrescriptionTemplate = z.infer<typeof prescriptionTemplateSchema>;

export const createPrescriptionTemplateSchema = z.object({
  name: shortTextSchema,
  speciesId: uuidSchema.optional(),
  items: z.array(prescriptionItemInputSchema).min(1).max(30),
});
export type CreatePrescriptionTemplate = z.infer<typeof createPrescriptionTemplateSchema>;

// --------------------------------------------------- vacina: protocolos
export const vaccineProtocolStepSchema = z.object({
  label: z.string(),
  intervalToNextDays: z.number().int().nullable(),
});

export const vaccineProtocolSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  kind: z.enum(['vaccine', 'deworming', 'ectoparasite']),
  speciesId: uuidSchema.nullable(),
  steps: z.array(vaccineProtocolStepSchema),
  boosterIntervalDays: z.number().int().nullable(),
});
export type VaccineProtocol = z.infer<typeof vaccineProtocolSchema>;

/** Protocolo já resolvido para um paciente: qual dose é agora e o lote de costume. */
export const patientProtocolSuggestionSchema = vaccineProtocolSchema.extend({
  dosesGiven: z.number().int(),
  nextDoseNumber: z.number().int(),
  nextDoseLabel: z.string(),
  suggestedNextDueAt: isoDateSchema.nullable(),
  lastAppliedAt: isoDateTimeSchema.nullable(),
  lot: z
    .object({
      manufacturer: z.string().nullable(),
      lotNumber: z.string().nullable(),
      expiresAt: isoDateSchema.nullable(),
    })
    .nullable(),
});
export type PatientProtocolSuggestion = z.infer<typeof patientProtocolSuggestionSchema>;

export const protocolSuggestionsQuerySchema = z.object({
  patientId: uuidSchema,
});
