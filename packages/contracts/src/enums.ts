import { z } from 'zod';

// ------------------------------------------------------------------ tenant
export const tenantStatusSchema = z.enum(['trial', 'active', 'suspended', 'closed']);
export type TenantStatus = z.infer<typeof tenantStatusSchema>;

export const facilityKindSchema = z.enum(['office', 'clinic', 'hospital', 'mobile', 'farm_visit']);
export type FacilityKind = z.infer<typeof facilityKindSchema>;

export const personTypeSchema = z.enum(['individual', 'company']);
export type PersonType = z.infer<typeof personTypeSchema>;

export const membershipStatusSchema = z.enum(['invited', 'active', 'suspended']);
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;

export const principalTypeSchema = z.enum(['staff', 'platform_staff', 'integration', 'guardian_portal']);
export type PrincipalType = z.infer<typeof principalTypeSchema>;

// ---------------------------------------------------------------- patients
export const patientSexSchema = z.enum(['male', 'female', 'unknown']);
export type PatientSex = z.infer<typeof patientSexSchema>;

export const reproductiveStatusSchema = z.enum(['intact', 'neutered', 'spayed', 'unknown']);
export type ReproductiveStatus = z.infer<typeof reproductiveStatusSchema>;

export const birthDatePrecisionSchema = z.enum(['exact', 'month', 'year', 'estimated']);
export type BirthDatePrecision = z.infer<typeof birthDatePrecisionSchema>;

export const patientStatusSchema = z.enum(['active', 'inactive', 'deceased', 'transferred']);
export type PatientStatus = z.infer<typeof patientStatusSchema>;

export const guardianRoleSchema = z.enum([
  'owner',
  'co_owner',
  'financial_responsible',
  'authorized_contact',
  'caretaker',
  'institution',
]);
export type GuardianRole = z.infer<typeof guardianRoleSchema>;

export const patientIdentifierSchemeSchema = z.enum([
  'microchip',
  'ear_tag',
  'sisbov',
  'leg_band',
  'passport',
  'registry',
  'tattoo',
  'license',
  'internal',
]);
export type PatientIdentifierScheme = z.infer<typeof patientIdentifierSchemeSchema>;

export const allergyStatusSchema = z.enum(['active', 'inactive', 'refuted']);
export const allergySeveritySchema = z.enum(['mild', 'moderate', 'severe', 'unknown']);

export const patientAlertKindSchema = z.enum([
  'aggressive',
  'contagious',
  'financial_block',
  'special_diet',
  'no_guardian',
  'other',
]);
export type PatientAlertKind = z.infer<typeof patientAlertKindSchema>;

export const deathKindSchema = z.enum(['natural', 'euthanasia']);
export const bodyDispositionSchema = z.enum(['guardian', 'cremation', 'burial', 'other', 'undefined']);

// -------------------------------------------------------------- taxonomy
export const taxonClassSchema = z.enum(['mammal', 'bird', 'reptile', 'amphibian', 'fish', 'other']);
export const speciesCategorySchema = z.enum(['companion', 'equine', 'livestock', 'wild', 'exotic']);
export const weightUomSchema = z.enum(['kg', 'g', 'lb']);

// -------------------------------------------------------------- scheduling
export const appointmentStatusSchema = z.enum([
  'scheduled',
  'confirmed',
  'checked_in',
  'in_service',
  'completed',
  'no_show',
  'cancelled',
  'rescheduled',
]);
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>;

export const appointmentPrioritySchema = z.enum(['routine', 'priority', 'urgent']);
export type AppointmentPriority = z.infer<typeof appointmentPrioritySchema>;

export const appointmentSourceSchema = z.enum(['staff', 'portal', 'phone', 'whatsapp', 'walk_in', 'api']);

export const serviceCategorySchema = z.enum([
  'consultation',
  'return',
  'vaccination',
  'preventive',
  'exam',
  'procedure',
  'surgery',
  'hospital_day',
  'grooming',
  'telehealth',
  'other',
]);
export type ServiceCategory = z.infer<typeof serviceCategorySchema>;

export const resourceKindSchema = z.enum(['room', 'operating_room', 'equipment', 'vehicle']);

// ---------------------------------------------------------------- clinical
export const encounterClassSchema = z.enum([
  'outpatient',
  'emergency',
  'inpatient',
  'surgery',
  'home_visit',
  'field',
  'telehealth',
]);
export type EncounterClass = z.infer<typeof encounterClassSchema>;

export const encounterStatusSchema = z.enum([
  'arrived',
  'triaged',
  'in_progress',
  'on_hold',
  'finished',
  'cancelled',
  'entered_in_error',
]);
export type EncounterStatus = z.infer<typeof encounterStatusSchema>;

export const encounterDispositionSchema = z.enum([
  'discharged',
  'referred',
  'admitted',
  'deceased',
  'transferred',
]);
export type EncounterDisposition = z.infer<typeof encounterDispositionSchema>;

export const noteKindSchema = z.enum([
  'triage',
  'chief_complaint',
  'history',
  'physical_exam',
  'assessment',
  'plan',
  'progress',
  'nursing',
  'procedure_note',
  'anesthesia_note',
  'discharge_summary',
  'addendum',
  'free',
]);
export type NoteKind = z.infer<typeof noteKindSchema>;

export const noteStatusSchema = z.enum(['draft', 'final', 'amended', 'entered_in_error']);
export type NoteStatus = z.infer<typeof noteStatusSchema>;

export const diagnosisKindSchema = z.enum(['differential', 'presumptive', 'final', 'ruled_out']);
export type DiagnosisKind = z.infer<typeof diagnosisKindSchema>;

export const problemStatusSchema = z.enum(['active', 'resolved', 'chronic']);

export const abnormalFlagSchema = z.enum(['low', 'normal', 'high', 'critical']);
export type AbnormalFlag = z.infer<typeof abnormalFlagSchema>;

export const observationValueKindSchema = z.enum(['numeric', 'text', 'code']);

export const referenceValidationStatusSchema = z.enum(['unvalidated', 'validated']);

// ------------------------------------------------------------ prescription
export const prescriptionKindSchema = z.enum(['simple', 'controlled', 'special', 'compounded']);
export type PrescriptionKind = z.infer<typeof prescriptionKindSchema>;

export const prescriptionStatusSchema = z.enum(['draft', 'signed', 'cancelled', 'entered_in_error']);
export type PrescriptionStatus = z.infer<typeof prescriptionStatusSchema>;

export const routeSchema = z.enum([
  'oral',
  'sc',
  'im',
  'iv',
  'im_pectoral',
  'topical',
  'ophthalmic',
  'otic',
  'inhalation',
  'intranasal',
  'sublingual',
  'rectal',
  'intramammary',
  'intrauterine',
  'epidural',
  'intracoelomic',
  'other',
]);
export type MedicationRoute = z.infer<typeof routeSchema>;

export const ROUTE_LABELS: Record<MedicationRoute, string> = {
  oral: 'Oral',
  sc: 'Subcutânea',
  im: 'Intramuscular',
  iv: 'Intravenosa',
  im_pectoral: 'Intramuscular peitoral',
  topical: 'Tópica',
  ophthalmic: 'Oftálmica',
  otic: 'Otológica',
  inhalation: 'Inalatória',
  intranasal: 'Intranasal',
  sublingual: 'Sublingual',
  rectal: 'Retal',
  intramammary: 'Intramamária',
  intrauterine: 'Intrauterina',
  epidural: 'Epidural',
  intracoelomic: 'Intracelomática',
  other: 'Outra',
};

export const frequencyKindSchema = z.enum(['interval_hours', 'times_per_day', 'once', 'prn', 'continuous', 'free']);
export type FrequencyKind = z.infer<typeof frequencyKindSchema>;

export const doseUomSchema = z.enum(['mg', 'ml', 'g', 'ui', 'tablet', 'capsule', 'drop', 'sachet', 'application']);
export type DoseUom = z.infer<typeof doseUomSchema>;

// -------------------------------------------------------------------- lab
export const examOrderStatusSchema = z.enum([
  'ordered',
  'partially_resulted',
  'resulted',
  'reviewed',
  'cancelled',
]);
export type ExamOrderStatus = z.infer<typeof examOrderStatusSchema>;

export const examOrderItemStatusSchema = z.enum([
  'requested',
  'collected',
  'sent',
  'in_progress',
  'resulted',
  'reviewed',
  'cancelled',
]);
export type ExamOrderItemStatus = z.infer<typeof examOrderItemStatusSchema>;

export const examPrioritySchema = z.enum(['routine', 'urgent', 'stat']);
export const examCategorySchema = z.enum([
  'hematology',
  'biochemistry',
  'imaging',
  'cytology',
  'microbiology',
  'urinalysis',
  'parasitology',
  'other',
]);
export const examResultStatusSchema = z.enum(['preliminary', 'final', 'amended', 'entered_in_error']);

// ----------------------------------------------------------- immunization
export const immunizationStatusSchema = z.enum(['completed', 'not_done', 'entered_in_error']);
export const preventiveKindSchema = z.enum(['deworming', 'ectoparasite', 'other']);
export type PreventiveKind = z.infer<typeof preventiveKindSchema>;

// -------------------------------------------------------------- documents
export const documentKindSchema = z.enum([
  'prescription',
  'consent',
  'report',
  'exam_result',
  'imaging',
  'certificate',
  'health_certificate',
  'vaccination_certificate',
  'attendance_statement',
  'referral_letter',
  'death_certificate',
  'medical_record',
  'photo',
  'invoice',
  'other',
]);
export type DocumentKind = z.infer<typeof documentKindSchema>;

export const documentStatusSchema = z.enum(['pending_upload', 'active', 'superseded', 'entered_in_error']);
export const virusScanStatusSchema = z.enum(['pending', 'clean', 'infected', 'error', 'skipped']);

export const documentTargetTypeSchema = z.enum([
  'patient',
  'guardian',
  'encounter',
  'exam_order',
  'prescription',
  'patient_death',
  'invoice',
]);
export type DocumentTargetType = z.infer<typeof documentTargetTypeSchema>;

export const consentKindSchema = z.enum([
  'treatment',
  'surgery',
  'anesthesia',
  'euthanasia',
  'hospitalization',
  'data_processing',
  'communication',
  'image_use',
]);

// ----------------------------------------------------------------- charge
export const chargeStatusSchema = z.enum(['pending', 'invoiced', 'settled_externally', 'cancelled']);
export type ChargeStatus = z.infer<typeof chargeStatusSchema>;

// ------------------------------------------------------------------ audit
export const auditCategorySchema = z.enum([
  'mutation',
  'sign',
  'cancel',
  'reopen',
  'merge',
  'authz_change',
  'entitlement_change',
  'access_denied',
  'export',
  'auth',
  'impersonation',
  'context_switch',
]);
export type AuditCategory = z.infer<typeof auditCategorySchema>;

export const accessResourceSchema = z.enum([
  'encounter',
  'record',
  'timeline',
  'document',
  'invoice',
  'export',
  'search',
]);

// -------------------------------------------------------------- timeline
export const timelineEventKindSchema = z.enum([
  'patient.created',
  'patient.deceased',
  'allergy.added',
  'weight.recorded',
  'appointment.scheduled',
  'appointment.cancelled',
  'appointment.no_show',
  'encounter.started',
  'encounter.finished',
  'encounter.cancelled',
  'note.final',
  'diagnosis.final',
  'prescription.signed',
  'exam.ordered',
  'exam.resulted',
  'immunization.applied',
  'preventive.applied',
  'document.attached',
]);
export type TimelineEventKind = z.infer<typeof timelineEventKindSchema>;

export const sensitivitySchema = z.enum(['basic', 'sensitive']);
