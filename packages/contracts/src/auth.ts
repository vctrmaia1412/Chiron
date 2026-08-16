import { z } from 'zod';
import { emailSchema, isoDateTimeSchema, nameSchema, uuidSchema } from './common';
import { facilityKindSchema, membershipStatusSchema, principalTypeSchema, tenantStatusSchema } from './enums';
import { MODULE_KEYS } from './permissions';

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
  client: z.enum(['web', 'native']).default('web'),
  tenantId: uuidSchema.optional(),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const tenantSummarySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  slug: z.string(),
  status: tenantStatusSchema,
  facilities: z.array(z.object({ id: uuidSchema, name: z.string(), kind: facilityKindSchema })),
});
export type TenantSummary = z.infer<typeof tenantSummarySchema>;

export const loginResponseSchema = z.object({
  user: z.object({ id: uuidSchema, name: z.string(), email: z.string() }),
  /** Presente apenas para `client: native`. */
  token: z.string().optional(),
  availableTenants: z.array(tenantSummarySchema),
  activeTenantId: uuidSchema.nullable(),
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const moduleStateSchema = z.enum(['active', 'trial', 'suspended', 'disabled']);

export const meContextSchema = z.object({
  user: z.object({
    id: uuidSchema,
    name: z.string(),
    email: z.string(),
    mfaEnabled: z.boolean(),
    isPlatformStaff: z.boolean(),
  }),
  principalType: principalTypeSchema,
  tenant: z
    .object({
      id: uuidSchema,
      name: z.string(),
      slug: z.string(),
      status: tenantStatusSchema,
      planKey: z.string(),
      timezone: z.string(),
      settings: z.record(z.string(), z.unknown()),
    })
    .nullable(),
  facility: z.object({ id: uuidSchema, name: z.string(), kind: facilityKindSchema }).nullable(),
  membership: z
    .object({
      id: uuidSchema,
      status: membershipStatusSchema,
      isOwner: z.boolean(),
      roles: z.array(z.object({ key: z.string(), name: z.string() })),
      professionalId: uuidSchema.nullable(),
      isLicensed: z.boolean(),
      allFacilities: z.boolean(),
      facilityIds: z.array(uuidSchema),
    })
    .nullable(),
  availableTenants: z.array(tenantSummarySchema),
  facilities: z.array(z.object({ id: uuidSchema, name: z.string(), kind: facilityKindSchema })),
  modules: z.record(z.enum(MODULE_KEYS), moduleStateSchema),
  permissions: z.array(z.string()),
  limits: z.record(z.string(), z.number()),
  permVersion: z.object({ tenant: z.number().int(), membership: z.number().int() }),
  authTime: isoDateTimeSchema.nullable(),
});
export type MeContext = z.infer<typeof meContextSchema>;

export const switchContextRequestSchema = z
  .object({
    tenantId: uuidSchema.optional(),
    facilityId: uuidSchema.nullable().optional(),
  })
  .refine((v) => v.tenantId !== undefined || v.facilityId !== undefined, {
    message: 'Informe tenantId ou facilityId',
  });
export type SwitchContextRequest = z.infer<typeof switchContextRequestSchema>;

export const forgotPasswordRequestSchema = z.object({ email: emailSchema });
export const resetPasswordRequestSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(10).max(200),
});

export const acceptInvitationRequestSchema = z.object({
  token: z.string().min(20).max(200),
  name: nameSchema.optional(),
  password: z.string().min(10).max(200).optional(),
});

export const stepUpRequestSchema = z.object({ password: z.string().min(1).max(200) });

export const sessionSummarySchema = z.object({
  id: uuidSchema,
  current: z.boolean(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  lastSeenAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
});
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

export const inviteMemberRequestSchema = z.object({
  email: emailSchema,
  name: nameSchema.optional(),
  roleKey: z.string().min(2).max(60),
  facilityIds: z.array(uuidSchema).default([]),
  allFacilities: z.boolean().default(true),
  professional: z
    .object({
      council: z.string().trim().max(10).default('CRMV'),
      councilNumber: z.string().trim().max(30),
      councilState: z.string().trim().length(2),
      specialties: z.array(z.string().trim().max(60)).default([]),
    })
    .optional(),
});
export type InviteMemberRequest = z.infer<typeof inviteMemberRequestSchema>;

export const memberSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  name: z.string(),
  email: z.string(),
  status: membershipStatusSchema,
  isOwner: z.boolean(),
  roles: z.array(z.object({ key: z.string(), name: z.string() })),
  professional: z
    .object({
      id: uuidSchema,
      council: z.string().nullable(),
      councilNumber: z.string().nullable(),
      councilState: z.string().nullable(),
      isLicensed: z.boolean(),
      color: z.string().nullable(),
    })
    .nullable(),
  allFacilities: z.boolean(),
  facilityIds: z.array(uuidSchema),
  createdAt: isoDateTimeSchema,
});
export type Member = z.infer<typeof memberSchema>;

export const updateMemberRequestSchema = z.object({
  roleKey: z.string().min(2).max(60).optional(),
  status: membershipStatusSchema.optional(),
  allFacilities: z.boolean().optional(),
  facilityIds: z.array(uuidSchema).optional(),
});
