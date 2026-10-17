import { z } from 'zod';
import { emailSchema, isoDateTimeSchema, uuidSchema } from './common';
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
export type ModuleState = z.infer<typeof moduleStateSchema>;

/**
 * Item de `GET /entitlements`, exatamente como a API devolve hoje. A chave do
 * módulo vem em `key`, não em `moduleKey`: ler o campo errado é o que fazia a
 * tela de Configurações mostrar módulo sem nome.
 */
export const entitlementSchema = z.object({
  key: z.enum(MODULE_KEYS),
  name: z.string(),
  dependsOn: z.array(z.enum(MODULE_KEYS)),
  alwaysOn: z.boolean(),
  state: moduleStateSchema,
  source: z.string().nullable(),
  expiresAt: isoDateTimeSchema.nullable(),
  graceUntil: isoDateTimeSchema.nullable(),
});
export type Entitlement = z.infer<typeof entitlementSchema>;

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
  name: z.string().trim().min(2, 'Informe seu nome completo.').max(160).optional(),
  password: z.string().min(10, 'A senha precisa ter pelo menos 10 caracteres.').max(200).optional(),
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

/** Unidades da federação. O CRMV é regional: número sem UF não identifica ninguém. */
export const BRAZILIAN_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;
export type BrazilianState = (typeof BRAZILIAN_STATES)[number];

/**
 * Registro em conselho informado no convite. As mensagens são por campo e em
 * português porque chegam direto ao formulário de quem convida.
 */
export const councilRegistrationSchema = z.object({
  council: z.string().trim().max(10).default('CRMV'),
  councilNumber: z
    .string('Informe o número do CRMV.')
    .trim()
    .min(1, 'Informe o número do CRMV.')
    .max(30, 'O número do CRMV tem no máximo 30 caracteres.'),
  councilState: z
    .string('Escolha a UF do CRMV.')
    .trim()
    .toUpperCase()
    .refine((value) => (BRAZILIAN_STATES as readonly string[]).includes(value), 'Escolha a UF do CRMV.'),
  specialties: z.array(z.string().trim().max(60)).default([]),
});

export const inviteMemberRequestSchema = z.object({
  email: z
    .string('Informe o e-mail.')
    .trim()
    .toLowerCase()
    .min(1, 'Informe o e-mail.')
    .max(320, 'E-mail longo demais.')
    .pipe(z.email('Confira o e-mail: parece incompleto.')),
  name: z.string().trim().min(2, 'O nome precisa ter ao menos 2 letras.').max(160).optional(),
  roleKey: z.string('Escolha o papel.').min(2, 'Escolha o papel.').max(60),
  facilityIds: z.array(uuidSchema).default([]),
  allFacilities: z.boolean().default(true),
  /** Obrigatório quando o papel exige registro (`requiresLicense`); a API confere pelo papel. */
  professional: councilRegistrationSchema.optional(),
});
export type InviteMemberRequest = z.infer<typeof inviteMemberRequestSchema>;

/**
 * Resposta de `POST /members/invite` e de `POST /members/invitations/:id/resend`.
 * `email` e `expiresAt` existem para a tela confirmar para quem foi e até
 * quando vale; o link só volta em desenvolvimento e teste.
 */
export const inviteMemberResponseSchema = z.object({
  id: uuidSchema,
  email: z.string(),
  expiresAt: isoDateTimeSchema,
  inviteUrl: z.string().optional(),
});
export type InviteMemberResponse = z.infer<typeof inviteMemberResponseSchema>;

/**
 * `details` do 409 de `POST /members/invite` quando o e-mail já tem convite
 * pendente e válido. Convidar de novo não troca o link em silêncio: a tela
 * oferece "Reenviar", que gera link novo de propósito e avisa que o antigo caiu.
 */
export const invitationPendingConflictSchema = z.object({
  reason: z.literal('invitation_pending'),
  invitationId: uuidSchema,
  sentAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
});
export type InvitationPendingConflict = z.infer<typeof invitationPendingConflictSchema>;

/** Item de `GET /members/invitations`: convite ainda não aceito nem revogado. */
export const pendingInvitationSchema = z.object({
  id: uuidSchema,
  email: z.string(),
  name: z.string().nullable(),
  role: z.object({ key: z.string(), name: z.string() }),
  invitedByName: z.string().nullable(),
  /** Último envio do link: muda a cada "Reenviar". */
  sentAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
  status: z.enum(['pending', 'expired']),
});
export type PendingInvitation = z.infer<typeof pendingInvitationSchema>;

/** Situação do convite vista pelo link. Só `pending` ainda pode ser aceito. */
export const invitationStatusSchema = z.enum(['pending', 'expired', 'revoked', 'accepted']);
export type InvitationStatus = z.infer<typeof invitationStatusSchema>;

/**
 * Resposta pública de `GET /auth/invitations/:token`. Quem tem o link é quem
 * recebeu o e-mail, mas link de e-mail é encaminhado: por isso o endereço vem
 * mascarado e só o que a pessoa precisa para saber o que fazer.
 */
export const invitationPreviewSchema = z.object({
  status: invitationStatusSchema,
  organizationName: z.string(),
  roleName: z.string(),
  invitedByName: z.string().nullable(),
  /** Ex.: `an•••@clinica.com.br`. */
  emailMasked: z.string(),
  /** Nome sugerido por quem convidou. Só vem enquanto o convite está pendente. */
  name: z.string().nullable(),
  expiresAt: isoDateTimeSchema,
  /**
   * O e-mail já tem conta com senha: o aceite pede a senha atual, não uma
   * nova. Só é calculado enquanto o convite está pendente; fora disso é `false`.
   */
  hasAccount: z.boolean(),
});
export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;

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

/**
 * Item de `GET /roles`. A tela de Papéis precisa do `id` para editar, de
 * `requiresLicense` para exigir CRMV no convite e só do total de permissões,
 * não da lista inteira.
 */
export const roleSummarySchema = z.object({
  id: uuidSchema,
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  requiresLicense: z.boolean(),
  isSystem: z.boolean(),
  permissionCount: z.number().int().nonnegative(),
});
export type RoleSummary = z.infer<typeof roleSummarySchema>;

/**
 * Cadastro aberto do piloto: a pessoa cria a própria conta e a clínica numa
 * tela só e já entra. O CRMV só é exigido de quem diz que é veterinário,
 * porque é o que permite assinar prontuário e receita.
 */
export const signupRequestSchema = z
  .object({
    name: z.string().trim().min(2, 'Informe seu nome completo.').max(160),
    email: emailSchema,
    password: z.string().min(10, 'A senha precisa ter pelo menos 10 caracteres.').max(200),
    clinicName: z.string().trim().min(2, 'Informe o nome da clínica.').max(120),
    city: z.string().trim().max(80).optional(),
    state: z.enum(BRAZILIAN_STATES).optional(),
    isVeterinarian: z.boolean().default(true),
    councilNumber: z.string().trim().max(30).optional(),
    councilState: z.enum(BRAZILIAN_STATES).optional(),
    acceptTerms: z.literal(true, 'Confirme que leu as condições do piloto.'),
    /** Campo-isca: invisível para pessoas, preenchido por robôs. */
    website: z.string().max(200).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.isVeterinarian) return;
    if (!value.councilNumber) {
      ctx.addIssue({ code: 'custom', path: ['councilNumber'], message: 'Informe o número do CRMV.' });
    }
    if (!value.councilState) {
      ctx.addIssue({ code: 'custom', path: ['councilState'], message: 'Escolha a UF do CRMV.' });
    }
  });
export type SignupRequest = z.infer<typeof signupRequestSchema>;
