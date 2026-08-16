import { z } from 'zod';
import { isoDateSchema, isoDateTimeSchema, uuidSchema } from './common';
import { appointmentStatusSchema, encounterStatusSchema } from './enums';

export const dashboardQuerySchema = z.object({
  facilityId: uuidSchema.optional(),
  /** Data de referência (padrão: hoje na timezone da unidade). */
  date: isoDateSchema.optional(),
});

export const dashboardSchema = z.object({
  date: isoDateSchema,
  metrics: z.object({
    appointmentsToday: z.number().int(),
    waiting: z.number().int(),
    inProgress: z.number().int(),
    finishedToday: z.number().int(),
    pendingExams: z.number().int(),
    followUpsDue: z.number().int(),
    immunizationsDue: z.number().int(),
    activePatients: z.number().int(),
  }),
  agenda: z.array(
    z.object({
      id: uuidSchema,
      startAt: isoDateTimeSchema,
      endAt: isoDateTimeSchema,
      patientName: z.string().nullable(),
      patientId: uuidSchema.nullable(),
      guardianName: z.string().nullable(),
      serviceName: z.string(),
      professionalName: z.string().nullable(),
      status: appointmentStatusSchema,
      encounterId: uuidSchema.nullable(),
    }),
  ),
  openEncounters: z.array(
    z.object({
      id: uuidSchema,
      patientId: uuidSchema,
      patientName: z.string(),
      status: encounterStatusSchema,
      startedAt: isoDateTimeSchema.nullable(),
      arrivedAt: isoDateTimeSchema.nullable(),
      professionalName: z.string().nullable(),
    }),
  ),
  alerts: z.array(
    z.object({
      kind: z.enum(['pending_exams', 'follow_ups', 'immunizations', 'unsigned_encounters']),
      label: z.string(),
      count: z.number().int(),
      href: z.string(),
    }),
  ),
  recentPatients: z.array(
    z.object({
      id: uuidSchema,
      name: z.string(),
      speciesName: z.string(),
      lastEncounterAt: isoDateTimeSchema.nullable(),
      guardianName: z.string().nullable(),
    }),
  ),
});
export type Dashboard = z.infer<typeof dashboardSchema>;

export const notificationSchema = z.object({
  id: uuidSchema,
  kind: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  link: z.string().nullable(),
  readAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
export type Notification = z.infer<typeof notificationSchema>;
