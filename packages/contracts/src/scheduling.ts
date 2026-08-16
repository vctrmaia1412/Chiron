import { z } from 'zod';
import { isoDateTimeSchema, paginationQuerySchema, uuidSchema } from './common';
import {
  appointmentPrioritySchema,
  appointmentSourceSchema,
  appointmentStatusSchema,
  encounterClassSchema,
  patientSexSchema,
  serviceCategorySchema,
} from './enums';

export const appointmentSchema = z.object({
  id: uuidSchema,
  number: z.number().int(),
  facilityId: uuidSchema,
  patient: z
    .object({
      id: uuidSchema,
      name: z.string(),
      speciesName: z.string(),
      breedName: z.string().nullable(),
      sex: patientSexSchema,
      ageLabel: z.string().nullable(),
    })
    .nullable(),
  guardian: z.object({ id: uuidSchema, name: z.string(), phone: z.string().nullable() }).nullable(),
  professional: z.object({ id: uuidSchema, name: z.string(), color: z.string().nullable() }).nullable(),
  service: z.object({ id: uuidSchema, name: z.string(), category: serviceCategorySchema }),
  status: appointmentStatusSchema,
  priority: appointmentPrioritySchema,
  startAt: isoDateTimeSchema,
  endAt: isoDateTimeSchema,
  reason: z.string().nullable(),
  notes: z.string().nullable(),
  source: appointmentSourceSchema,
  confirmedAt: isoDateTimeSchema.nullable(),
  checkedInAt: isoDateTimeSchema.nullable(),
  cancelledAt: isoDateTimeSchema.nullable(),
  cancelReason: z.string().nullable(),
  encounterId: uuidSchema.nullable(),
  originEncounterId: uuidSchema.nullable(),
  createdAt: isoDateTimeSchema,
  version: z.number().int(),
});
export type Appointment = z.infer<typeof appointmentSchema>;

export const createAppointmentSchema = z
  .object({
    facilityId: uuidSchema.optional(),
    patientId: uuidSchema.optional(),
    guardianId: uuidSchema.optional(),
    professionalId: uuidSchema.optional(),
    serviceId: uuidSchema,
    startAt: isoDateTimeSchema,
    /** Se ausente, usa a duração padrão do serviço. */
    endAt: isoDateTimeSchema.optional(),
    priority: appointmentPrioritySchema.default('routine'),
    reason: z.string().trim().max(500).optional(),
    notes: z.string().trim().max(2000).optional(),
    source: appointmentSourceSchema.default('staff'),
    originEncounterId: uuidSchema.optional(),
    /** Permite sobreposição no mesmo profissional (overbooking explícito). */
    allowOverlap: z.boolean().default(false),
  })
  .refine((v) => Boolean(v.patientId) || Boolean(v.guardianId), {
    message: 'Informe ao menos o paciente ou o tutor',
    path: ['patientId'],
  });
export type CreateAppointment = z.infer<typeof createAppointmentSchema>;

export const updateAppointmentSchema = z.object({
  professionalId: uuidSchema.nullable().optional(),
  serviceId: uuidSchema.optional(),
  startAt: isoDateTimeSchema.optional(),
  endAt: isoDateTimeSchema.optional(),
  priority: appointmentPrioritySchema.optional(),
  reason: z.string().trim().max(500).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  patientId: uuidSchema.optional(),
  allowOverlap: z.boolean().optional(),
  expectedVersion: z.number().int().optional(),
});

export const cancelAppointmentSchema = z.object({
  reason: z.string().trim().min(3).max(300),
});

export const checkInSchema = z.object({
  /** Peso aferido na recepção, em kg. */
  weightKg: z.number().positive().max(20000).optional(),
  /** Unidade digitada pelo operador (kg ou g). */
  weightUom: z.enum(['kg', 'g']).default('kg'),
  encounterClass: encounterClassSchema.optional(),
  notes: z.string().trim().max(500).optional(),
});
export type CheckIn = z.infer<typeof checkInSchema>;

export const listAppointmentsQuerySchema = z.object({
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
  facilityId: uuidSchema.optional(),
  professionalId: uuidSchema.optional(),
  patientId: uuidSchema.optional(),
  status: appointmentStatusSchema.optional(),
  q: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export const followUpSchema = z.object({
  encounterId: uuidSchema,
  patientId: uuidSchema,
  patientName: z.string(),
  guardianName: z.string().nullable(),
  guardianPhone: z.string().nullable(),
  dueAt: z.string(),
  reason: z.string().nullable(),
  finishedAt: isoDateTimeSchema.nullable(),
  professionalName: z.string().nullable(),
  appointmentId: uuidSchema.nullable(),
});
export type FollowUp = z.infer<typeof followUpSchema>;

export const listFollowUpsQuerySchema = paginationQuerySchema.extend({
  dueUntil: z.string().optional(),
  includeScheduled: z.coerce.boolean().default(false),
});

export const resourceSchema = z.object({
  id: uuidSchema,
  facilityId: uuidSchema,
  kind: z.enum(['room', 'operating_room', 'equipment', 'vehicle']),
  name: z.string(),
  active: z.boolean(),
});
