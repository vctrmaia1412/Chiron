import { z } from 'zod';
import {
  addressSchema,
  documentNumberSchema,
  emailSchema,
  isoDateSchema,
  isoDateTimeSchema,
  moneySchema,
  nameSchema,
  paginationQuerySchema,
  phoneSchema,
  shortTextSchema,
  uuidSchema,
} from './common';
import {
  allergySeveritySchema,
  allergyStatusSchema,
  birthDatePrecisionSchema,
  bodyDispositionSchema,
  deathKindSchema,
  guardianRoleSchema,
  patientAlertKindSchema,
  patientIdentifierSchemeSchema,
  patientSexSchema,
  patientStatusSchema,
  personTypeSchema,
  problemStatusSchema,
  reproductiveStatusSchema,
  serviceCategorySchema,
  speciesCategorySchema,
  taxonClassSchema,
  weightUomSchema,
} from './enums';

// ------------------------------------------------------------------ tutor
export const guardianContactSchema = z.object({
  id: uuidSchema,
  kind: z.enum(['phone', 'whatsapp', 'email']),
  value: z.string(),
  isPrimary: z.boolean(),
});

export const guardianSchema = z.object({
  id: uuidSchema,
  number: z.number().int(),
  personType: personTypeSchema,
  name: z.string(),
  legalName: z.string().nullable(),
  documentKind: z.enum(['cpf', 'cnpj', 'passport', 'none']),
  documentMasked: z.string().nullable(),
  email: z.string().nullable(),
  phonePrimary: z.string().nullable(),
  phoneSecondary: z.string().nullable(),
  birthDate: isoDateSchema.nullable(),
  address: addressSchema.nullable(),
  notes: z.string().nullable(),
  tags: z.array(z.string()),
  patientCount: z.number().int().nonnegative().optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Guardian = z.infer<typeof guardianSchema>;

export const createGuardianSchema = z.object({
  personType: personTypeSchema.default('individual'),
  name: nameSchema,
  legalName: z.string().trim().max(200).optional(),
  documentKind: z.enum(['cpf', 'cnpj', 'passport', 'none']).default('none'),
  document: documentNumberSchema.optional(),
  email: emailSchema.optional(),
  phonePrimary: phoneSchema.optional(),
  phoneSecondary: phoneSchema.optional(),
  birthDate: isoDateSchema.optional(),
  address: addressSchema.optional(),
  notes: z.string().trim().max(4000).optional(),
  tags: z.array(z.string().trim().max(40)).max(20).default([]),
});
export type CreateGuardian = z.infer<typeof createGuardianSchema>;

export const updateGuardianSchema = createGuardianSchema.partial();

export const listGuardiansQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
});

// --------------------------------------------------------------- taxonomy
export const speciesSchema = z.object({
  id: uuidSchema,
  code: z.string(),
  namePt: z.string(),
  nameScientific: z.string().nullable(),
  taxonClass: taxonClassSchema,
  category: speciesCategorySchema,
  defaultWeightUom: weightUomSchema,
  supportsGroup: z.boolean(),
  isGlobal: z.boolean(),
  requiresScientificName: z.boolean(),
  observationPanel: z.array(z.string()),
});
export type Species = z.infer<typeof speciesSchema>;

export const breedSchema = z.object({
  id: uuidSchema,
  speciesId: uuidSchema,
  name: z.string(),
  sizeClass: z.enum(['toy', 'small', 'medium', 'large', 'giant']).nullable(),
  isGlobal: z.boolean(),
});
export type Breed = z.infer<typeof breedSchema>;

export const referenceRangeSchema = z.object({
  id: uuidSchema,
  speciesId: uuidSchema,
  parameterCode: z.string(),
  lifeStage: z.enum(['puppy', 'adult', 'senior']).nullable(),
  sex: patientSexSchema.nullable(),
  weightMinKg: z.string().nullable(),
  weightMaxKg: z.string().nullable(),
  minValue: z.string().nullable(),
  maxValue: z.string().nullable(),
  uom: z.string(),
  source: z.string().nullable(),
  validationStatus: z.enum(['unvalidated', 'validated']),
  isGlobal: z.boolean(),
});
export type ReferenceRange = z.infer<typeof referenceRangeSchema>;

export const observationCodeSchema = z.object({
  code: z.string(),
  name: z.string(),
  valueKind: z.enum(['numeric', 'text', 'code']),
  canonicalUom: z.string().nullable(),
  allowedUoms: z.array(z.string()),
  allowedCodes: z.array(z.string()),
  scale: z.string().nullable(),
  sort: z.number().int(),
});
export type ObservationCode = z.infer<typeof observationCodeSchema>;

// -------------------------------------------------------------- paciente
export const patientGuardianLinkSchema = z.object({
  guardianId: uuidSchema,
  guardianName: z.string(),
  guardianPhone: z.string().nullable(),
  guardianEmail: z.string().nullable(),
  role: guardianRoleSchema,
  isPrimary: z.boolean(),
});

export const patientIdentifierSchema = z.object({
  id: uuidSchema,
  scheme: patientIdentifierSchemeSchema,
  value: z.string(),
  issuer: z.string().nullable(),
});

export const patientAllergySchema = z.object({
  id: uuidSchema,
  substance: z.string(),
  reaction: z.string().nullable(),
  severity: allergySeveritySchema,
  status: allergyStatusSchema,
  notedAt: isoDateTimeSchema,
});
export type PatientAllergy = z.infer<typeof patientAllergySchema>;

export const patientAlertSchema = z.object({
  id: uuidSchema,
  kind: patientAlertKindSchema,
  message: z.string(),
  active: z.boolean(),
});

export const patientProblemSchema = z.object({
  id: uuidSchema,
  description: z.string(),
  status: problemStatusSchema,
  onsetAt: isoDateTimeSchema.nullable(),
  resolvedAt: isoDateTimeSchema.nullable(),
});

export const patientSchema = z.object({
  id: uuidSchema,
  number: z.number().int(),
  name: z.string(),
  species: z.object({
    id: uuidSchema,
    code: z.string(),
    namePt: z.string(),
    category: speciesCategorySchema,
    defaultWeightUom: weightUomSchema,
  }),
  breed: z.object({ id: uuidSchema, name: z.string() }).nullable(),
  breedFreeText: z.string().nullable(),
  sex: patientSexSchema,
  reproductiveStatus: reproductiveStatusSchema,
  birthDate: isoDateSchema.nullable(),
  birthDatePrecision: birthDatePrecisionSchema.nullable(),
  estimatedAgeMonths: z.number().int().nullable(),
  ageLabel: z.string().nullable(),
  colorMarkings: z.string().nullable(),
  currentWeightKg: z.string().nullable(),
  currentWeightAt: isoDateTimeSchema.nullable(),
  status: patientStatusSchema,
  noKnownAllergies: z.boolean(),
  attributes: z.record(z.string(), z.unknown()),
  notes: z.string().nullable(),
  internalCode: z.string().nullable(),
  guardians: z.array(patientGuardianLinkSchema),
  identifiers: z.array(patientIdentifierSchema),
  allergies: z.array(patientAllergySchema),
  alerts: z.array(patientAlertSchema),
  deceasedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Patient = z.infer<typeof patientSchema>;

export const patientListItemSchema = z.object({
  id: uuidSchema,
  number: z.number().int(),
  name: z.string(),
  speciesName: z.string(),
  speciesCategory: speciesCategorySchema,
  breedName: z.string().nullable(),
  sex: patientSexSchema,
  ageLabel: z.string().nullable(),
  currentWeightKg: z.string().nullable(),
  status: patientStatusSchema,
  primaryGuardianName: z.string().nullable(),
  primaryGuardianPhone: z.string().nullable(),
  alertCount: z.number().int(),
  lastEncounterAt: isoDateTimeSchema.nullable(),
});
export type PatientListItem = z.infer<typeof patientListItemSchema>;

export const createPatientSchema = z.object({
  name: nameSchema,
  speciesId: uuidSchema,
  breedId: uuidSchema.optional(),
  breedFreeText: z.string().trim().max(120).optional(),
  sex: patientSexSchema.default('unknown'),
  reproductiveStatus: reproductiveStatusSchema.default('unknown'),
  birthDate: isoDateSchema.optional(),
  birthDatePrecision: birthDatePrecisionSchema.optional(),
  estimatedAgeMonths: z.number().int().min(0).max(1200).optional(),
  colorMarkings: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(4000).optional(),
  internalCode: z.string().trim().max(40).optional(),
  attributes: z.record(z.string(), z.unknown()).default({}),
  /** Vincula tutor existente. */
  guardians: z
    .array(
      z.object({
        guardianId: uuidSchema,
        role: guardianRoleSchema.default('owner'),
        isPrimary: z.boolean().default(false),
      }),
    )
    .default([]),
  /** Cadastro rápido: cria tutor e paciente na mesma transação. */
  newGuardian: createGuardianSchema.optional(),
  identifiers: z
    .array(z.object({ scheme: patientIdentifierSchemeSchema, value: shortTextSchema, issuer: z.string().trim().max(80).optional() }))
    .default([]),
  /** Peso inicial em kg (opcional). */
  weightKg: z.number().positive().max(20000).optional(),
});
export type CreatePatient = z.infer<typeof createPatientSchema>;

export const updatePatientSchema = createPatientSchema
  .omit({ guardians: true, newGuardian: true, identifiers: true, weightKg: true })
  .partial()
  .extend({
    status: patientStatusSchema.optional(),
    noKnownAllergies: z.boolean().optional(),
  });

export const listPatientsQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
  speciesId: uuidSchema.optional(),
  status: patientStatusSchema.optional(),
  guardianId: uuidSchema.optional(),
});

export const addPatientGuardianSchema = z.object({
  guardianId: uuidSchema,
  role: guardianRoleSchema.default('owner'),
  isPrimary: z.boolean().default(false),
});

export const createAllergySchema = z.object({
  substance: shortTextSchema,
  reaction: z.string().trim().max(200).optional(),
  severity: allergySeveritySchema.default('unknown'),
});

export const createAlertSchema = z.object({
  kind: patientAlertKindSchema,
  message: shortTextSchema,
});

export const recordDeathSchema = z.object({
  occurredAt: isoDateTimeSchema,
  kind: deathKindSchema,
  causeText: z.string().trim().max(500).optional(),
  encounterId: uuidSchema.optional(),
  bodyDisposition: bodyDispositionSchema.default('undefined'),
  consentId: uuidSchema.optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type RecordDeath = z.infer<typeof recordDeathSchema>;

export const patientWeightSchema = z.object({
  id: uuidSchema,
  measuredAt: isoDateTimeSchema,
  weightKg: z.string(),
  enteredValue: z.string().nullable(),
  enteredUom: z.string().nullable(),
  encounterId: uuidSchema.nullable(),
});

// --------------------------------------------------------- profissionais
export const professionalSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema.nullable(),
  name: z.string(),
  council: z.string().nullable(),
  councilNumber: z.string().nullable(),
  councilState: z.string().nullable(),
  isLicensed: z.boolean(),
  specialties: z.array(z.string()),
  color: z.string().nullable(),
  isExternal: z.boolean(),
  active: z.boolean(),
});
export type Professional = z.infer<typeof professionalSchema>;

export const createProfessionalSchema = z.object({
  name: nameSchema,
  council: z.string().trim().max(10).optional(),
  councilNumber: z.string().trim().max(30).optional(),
  councilState: z.string().trim().length(2).optional(),
  specialties: z.array(z.string().trim().max(60)).max(10).default([]),
  color: z.string().trim().max(20).optional(),
  isExternal: z.boolean().default(false),
});

// -------------------------------------------------------------- serviços
export const serviceSchema = z.object({
  id: uuidSchema,
  key: z.string(),
  name: z.string(),
  category: serviceCategorySchema,
  defaultDurationMin: z.number().int(),
  defaultPrice: moneySchema.nullable(),
  requiresProfessional: z.boolean(),
  requiresResource: z.boolean(),
  color: z.string().nullable(),
  active: z.boolean(),
});
export type Service = z.infer<typeof serviceSchema>;

export const createServiceSchema = z.object({
  key: z.string().trim().min(2).max(60).regex(/^[a-z0-9_]+$/, 'Use letras minúsculas, números e underscore'),
  name: nameSchema,
  category: serviceCategorySchema,
  defaultDurationMin: z.number().int().min(5).max(600).default(30),
  defaultPrice: moneySchema.optional(),
  requiresProfessional: z.boolean().default(true),
  requiresResource: z.boolean().default(false),
  color: z.string().trim().max(20).optional(),
  active: z.boolean().default(true),
});

export const updateServiceSchema = createServiceSchema.partial().omit({ key: true });

// ----------------------------------------------------------------- busca
export const searchResultSchema = z.object({
  type: z.enum(['patient', 'guardian', 'appointment', 'encounter']),
  id: uuidSchema,
  title: z.string(),
  subtitle: z.string().nullable(),
  href: z.string(),
});
export type SearchResult = z.infer<typeof searchResultSchema>;
