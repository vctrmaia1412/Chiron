/**
 * Catálogo canônico de módulos, permissões e papéis do CHIRON.
 *
 * Fonte de verdade: docs/CHIRON_MASTER_ANALYSIS.md, seções 14.1 e 14.3.
 * O banco é semeado a partir daqui (migração de seed do catálogo).
 *
 * Regras:
 * - chave de permissão no formato `recurso:acao`, minúscula;
 * - toda permissão pertence a exatamente um módulo (`module_key`), nunca ao nome;
 * - toda rota e todo caso de uso declara `{ module, permission }`.
 */

export const MODULE_KEYS = [
  'core',
  'scheduling',
  'clinical',
  'lab',
  'immunization',
  'documents',
  'comms',
  'inventory',
  'reports',
  'billing',
  'inpatient',
  'surgery',
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export interface ModuleDefinition {
  key: ModuleKey;
  name: string;
  /** Módulos que precisam estar habilitados para este funcionar. */
  dependsOn: ModuleKey[];
  /** `core` está sempre ativo e não pode ser desabilitado. */
  alwaysOn: boolean;
  sort: number;
}

export const MODULES: readonly ModuleDefinition[] = [
  { key: 'core', name: 'Núcleo', dependsOn: [], alwaysOn: true, sort: 10 },
  { key: 'scheduling', name: 'Agenda', dependsOn: ['core'], alwaysOn: false, sort: 20 },
  { key: 'clinical', name: 'Atendimento e prontuário', dependsOn: ['core'], alwaysOn: false, sort: 30 },
  { key: 'lab', name: 'Exames', dependsOn: ['clinical'], alwaysOn: false, sort: 40 },
  { key: 'immunization', name: 'Vacinas e preventivos', dependsOn: ['clinical'], alwaysOn: false, sort: 50 },
  { key: 'documents', name: 'Documentos', dependsOn: ['clinical'], alwaysOn: false, sort: 60 },
  { key: 'comms', name: 'Comunicações', dependsOn: ['core'], alwaysOn: false, sort: 70 },
  { key: 'inventory', name: 'Estoque', dependsOn: ['core'], alwaysOn: false, sort: 80 },
  { key: 'reports', name: 'Relatórios', dependsOn: ['core'], alwaysOn: false, sort: 90 },
  { key: 'billing', name: 'Financeiro', dependsOn: ['core'], alwaysOn: false, sort: 100 },
  { key: 'inpatient', name: 'Internação', dependsOn: ['clinical'], alwaysOn: false, sort: 110 },
  { key: 'surgery', name: 'Centro cirúrgico', dependsOn: ['clinical', 'scheduling'], alwaysOn: false, sort: 120 },
] as const;

export const MODULE_BY_KEY: Record<ModuleKey, ModuleDefinition> = Object.fromEntries(
  MODULES.map((m) => [m.key, m]),
) as Record<ModuleKey, ModuleDefinition>;

/** Verbos permitidos no sufixo de uma permissão (vocabulário fechado). */
export const PERMISSION_VERBS = [
  'read',
  'list',
  'create',
  'update',
  'delete',
  'sign',
  'amend',
  'cancel',
  'approve',
  'export',
  'assign',
  'adjust',
  'receive',
  'dispense',
  'count',
  'transfer',
  'refund',
  'close',
  'reopen',
  'checkin',
  'generate',
  'merge',
  'record',
  'apply',
  'collect',
  'submit',
  'invite',
  'remove',
  'manage',
  'block',
  'schedule',
  'admit',
  'discharge',
  'administer',
  'order',
  'send',
  'validate',
  'impersonate',
  'anonymize',
  'read_sensitive',
  'record_basic',
  'manage_billing',
  'template_manage',
  'approve_count',
  'resolve',
] as const;

export interface PermissionDefinition {
  key: string;
  module: ModuleKey;
  description: string;
}

function p(module: ModuleKey, key: string, description: string): PermissionDefinition {
  return { key, module, description };
}

export const PERMISSIONS: readonly PermissionDefinition[] = [
  // ---------------------------------------------------------------- core
  p('core', 'tenant:read', 'Ver dados da organização'),
  p('core', 'tenant:update', 'Editar dados e configurações da organização'),
  p('core', 'tenant:manage_billing', 'Gerenciar plano e cobrança da organização'),
  p('core', 'facility:read', 'Ver unidades'),
  p('core', 'facility:manage', 'Criar e editar unidades'),
  p('core', 'member:read', 'Ver membros da organização'),
  p('core', 'member:invite', 'Convidar membros'),
  p('core', 'member:update', 'Editar membros e papéis'),
  p('core', 'member:remove', 'Remover membros'),
  p('core', 'role:read', 'Ver papéis e permissões'),
  p('core', 'role:manage', 'Criar e editar papéis'),
  p('core', 'entitlement:read', 'Ver módulos habilitados'),
  p('core', 'audit:read', 'Consultar auditoria e log de acesso'),
  p('core', 'session:manage', 'Gerenciar sessões de outros usuários'),
  p('core', 'guardian:read', 'Ver tutores'),
  p('core', 'guardian:create', 'Cadastrar tutores'),
  p('core', 'guardian:update', 'Editar tutores'),
  p('core', 'guardian:delete', 'Inativar tutores'),
  p('core', 'guardian:export', 'Exportar dados de tutores (LGPD)'),
  p('core', 'guardian:merge', 'Unificar tutores duplicados'),
  p('core', 'guardian:anonymize', 'Anonimizar dados pessoais de tutor (LGPD)'),
  p('core', 'patient:read', 'Ver pacientes'),
  p('core', 'patient:create', 'Cadastrar pacientes'),
  p('core', 'patient:update', 'Editar pacientes'),
  p('core', 'patient:delete', 'Inativar pacientes'),
  p('core', 'patient:merge', 'Unificar pacientes duplicados'),
  p('core', 'patient:export', 'Exportar dados do paciente (LGPD)'),
  p('core', 'professional:read', 'Ver profissionais'),
  p('core', 'professional:manage', 'Cadastrar e editar profissionais'),
  p('core', 'service:read', 'Ver catálogo de serviços'),
  p('core', 'service:manage', 'Editar catálogo de serviços'),
  p('core', 'catalog:manage', 'Editar catálogos (espécies, raças, faixas de referência, exames)'),
  p('core', 'search:use', 'Usar a busca global'),

  // ---------------------------------------------------------- scheduling
  p('scheduling', 'appointment:read', 'Ver agenda e agendamentos'),
  p('scheduling', 'appointment:create', 'Criar agendamentos'),
  p('scheduling', 'appointment:update', 'Editar, confirmar e reagendar'),
  p('scheduling', 'appointment:cancel', 'Cancelar agendamentos e marcar falta'),
  p('scheduling', 'appointment:checkin', 'Fazer check-in do paciente'),
  p('scheduling', 'schedule:manage', 'Configurar agendas de profissionais'),
  p('scheduling', 'schedule:block', 'Criar bloqueios de agenda'),
  p('scheduling', 'resource:manage', 'Gerenciar salas e recursos'),

  // ------------------------------------------------------------ clinical
  p('clinical', 'encounter:read', 'Ver atendimentos (resumo)'),
  p('clinical', 'record:read_sensitive', 'Ver conteúdo clínico do prontuário'),
  p('clinical', 'encounter:checkin', 'Abrir atendimento no check-in'),
  p('clinical', 'encounter:create', 'Abrir atendimento sem agendamento'),
  p('clinical', 'encounter:update', 'Registrar no atendimento em andamento'),
  p('clinical', 'observation:record_basic', 'Registrar peso e medições básicas'),
  p('clinical', 'encounter:sign', 'Finalizar e assinar atendimento'),
  p('clinical', 'encounter:amend', 'Criar adendo em atendimento finalizado'),
  p('clinical', 'encounter:cancel', 'Cancelar atendimento'),
  p('clinical', 'encounter:reassign', 'Trocar o profissional responsável'),
  p('clinical', 'encounter:reopen', 'Reabrir atendimento finalizado'),
  p('clinical', 'record:export', 'Exportar prontuário em PDF'),
  p('clinical', 'death:record', 'Registrar óbito'),
  p('clinical', 'prescription:read', 'Ver receitas'),
  p('clinical', 'prescription:create', 'Criar receitas'),
  p('clinical', 'prescription:sign', 'Assinar e emitir receitas'),
  p('clinical', 'prescription:cancel', 'Cancelar receitas emitidas'),
  p('clinical', 'prescription:controlled', 'Prescrever medicamentos controlados'),
  p('clinical', 'prescription:template_manage', 'Gerenciar modelos de receita'),
  p('clinical', 'charge:read', 'Ver resumo para cobrança'),

  // ----------------------------------------------------------------- lab
  p('lab', 'exam_order:read', 'Ver pedidos de exame'),
  p('lab', 'exam_order:create', 'Solicitar exames'),
  p('lab', 'exam_order:cancel', 'Cancelar pedidos de exame'),
  p('lab', 'exam:collect', 'Registrar coleta de material'),
  p('lab', 'exam_result:submit', 'Lançar resultado de exame'),
  p('lab', 'exam_result:sign', 'Revisar e liberar resultado'),
  p('lab', 'exam_result:amend', 'Retificar resultado liberado'),
  p('lab', 'laboratory:manage', 'Gerenciar laboratórios'),

  // -------------------------------------------------------- immunization
  p('immunization', 'immunization:read', 'Ver vacinas e preventivos'),
  p('immunization', 'immunization:apply', 'Aplicar vacina'),
  p('immunization', 'immunization:update', 'Editar registro de vacina'),
  p('immunization', 'immunization:cancel', 'Cancelar registro de vacina'),
  p('immunization', 'preventive:record', 'Registrar vermífugo ou antiparasitário'),
  p('immunization', 'protocol:manage', 'Gerenciar protocolos vacinais'),

  // ----------------------------------------------------------- documents
  p('documents', 'document:read', 'Ver e baixar documentos'),
  p('documents', 'document:create', 'Enviar arquivos'),
  p('documents', 'document:generate', 'Gerar documentos por modelo'),
  p('documents', 'document:delete', 'Remover documentos'),
  p('documents', 'document_template:manage', 'Gerenciar modelos de documento'),
  p('documents', 'consent:manage', 'Registrar consentimentos'),

  // --------------------------------------------------------------- comms
  p('comms', 'notification:read', 'Ver notificações'),
  p('comms', 'message:send', 'Enviar mensagens ao tutor'),
  p('comms', 'template:manage', 'Gerenciar modelos de mensagem'),

  // ----------------------------------------------------------- inventory
  p('inventory', 'product:read', 'Ver produtos'),
  p('inventory', 'product:manage', 'Cadastrar e editar produtos'),
  p('inventory', 'stock:read', 'Ver saldo de estoque'),
  p('inventory', 'stock:receive', 'Registrar entrada de estoque'),
  p('inventory', 'stock:dispense', 'Dispensar produtos'),
  p('inventory', 'stock:adjust', 'Ajustar estoque'),
  p('inventory', 'stock:count', 'Fazer contagem de estoque'),
  p('inventory', 'stock:transfer', 'Transferir entre unidades'),
  p('inventory', 'stock:approve_count', 'Aprovar divergência de contagem'),
  p('inventory', 'identifier:resolve', 'Resolver código de barras'),
  p('inventory', 'identifier:manage', 'Cadastrar códigos de barras'),
  p('inventory', 'supplier:manage', 'Gerenciar fornecedores'),

  // ------------------------------------------------------------- billing
  p('billing', 'charge:create', 'Lançar itens cobráveis'),
  p('billing', 'invoice:read', 'Ver faturas'),
  p('billing', 'invoice:create', 'Emitir faturas'),
  p('billing', 'invoice:cancel', 'Cancelar faturas'),
  p('billing', 'payment:read', 'Ver pagamentos'),
  p('billing', 'payment:create', 'Receber pagamentos'),
  p('billing', 'payment:refund', 'Estornar pagamentos'),
  p('billing', 'cash:close', 'Fechar caixa'),
  p('billing', 'cash:reopen', 'Reabrir caixa'),
  p('billing', 'price:manage', 'Gerenciar tabela de preços'),
  p('billing', 'billing:report', 'Ver relatórios financeiros'),

  // ------------------------------------------------------------- reports
  p('reports', 'report:read', 'Ver relatórios'),
  p('reports', 'report:export', 'Exportar relatórios'),

  // ----------------------------------------------------------- inpatient
  p('inpatient', 'hospitalization:read', 'Ver internações'),
  p('inpatient', 'hospitalization:admit', 'Internar paciente'),
  p('inpatient', 'hospitalization:update', 'Atualizar internação'),
  p('inpatient', 'hospitalization:discharge', 'Dar alta'),
  p('inpatient', 'treatment:order', 'Prescrever tratamento hospitalar'),
  p('inpatient', 'treatment:administer', 'Administrar medicação'),
  p('inpatient', 'bed:manage', 'Gerenciar leitos'),

  // ------------------------------------------------------------- surgery
  p('surgery', 'surgery:read', 'Ver cirurgias'),
  p('surgery', 'surgery:schedule', 'Agendar cirurgias'),
  p('surgery', 'surgery:update', 'Editar cirurgia'),
  p('surgery', 'surgery:sign', 'Finalizar cirurgia'),
  p('surgery', 'surgery:cancel', 'Cancelar cirurgia'),
] as const;

export const PERMISSION_KEYS = PERMISSIONS.map((x) => x.key);
export type PermissionKey = (typeof PERMISSIONS)[number]['key'];

export const PERMISSION_BY_KEY: Record<string, PermissionDefinition> = Object.fromEntries(
  PERMISSIONS.map((x) => [x.key, x]),
);

/** Permissões consideradas de leitura: continuam válidas com o módulo suspenso. */
export function isReadOnlyPermission(key: string): boolean {
  const verb = key.split(':')[1] ?? '';
  return verb === 'read' || verb === 'list' || verb === 'export' || verb === 'read_sensitive';
}

export interface RoleTemplate {
  key: string;
  name: string;
  description: string;
  /** `true` quando o papel exige registro profissional válido para assinar. */
  clinical: boolean;
  permissions: string[];
  sort: number;
}

const ALL = PERMISSION_KEYS.filter((k) => !k.startsWith('platform:'));

const OWNER_EXCLUDED: string[] = [];
const ADMIN_EXCLUDED = ['tenant:manage_billing'];

export const ROLE_TEMPLATES: readonly RoleTemplate[] = [
  {
    key: 'owner',
    name: 'Proprietário',
    description: 'Acesso total, incluindo plano, cobrança e transferência de titularidade.',
    clinical: false,
    permissions: ALL.filter((k) => !OWNER_EXCLUDED.includes(k)),
    sort: 10,
  },
  {
    key: 'admin',
    name: 'Administrador',
    description: 'Gestão completa da operação, exceto plano e cobrança.',
    clinical: false,
    permissions: ALL.filter((k) => !ADMIN_EXCLUDED.includes(k)),
    sort: 20,
  },
  {
    key: 'veterinarian',
    name: 'Veterinário',
    description: 'Fluxo clínico completo, agenda e cadastro.',
    clinical: true,
    permissions: [
      'tenant:read',
      'facility:read',
      'member:read',
      'professional:read',
      'service:read',
      'search:use',
      'guardian:read',
      'guardian:create',
      'guardian:update',
      'patient:read',
      'patient:create',
      'patient:update',
      'patient:export',
      'appointment:read',
      'appointment:create',
      'appointment:update',
      'appointment:cancel',
      'appointment:checkin',
      'encounter:read',
      'record:read_sensitive',
      'encounter:checkin',
      'encounter:create',
      'encounter:update',
      'observation:record_basic',
      'encounter:sign',
      'encounter:amend',
      'encounter:cancel',
      'record:export',
      'death:record',
      'prescription:read',
      'prescription:create',
      'prescription:sign',
      'prescription:cancel',
      'prescription:controlled',
      'prescription:template_manage',
      'charge:read',
      'exam_order:read',
      'exam_order:create',
      'exam_order:cancel',
      'exam:collect',
      'exam_result:submit',
      'exam_result:sign',
      'immunization:read',
      'immunization:apply',
      'immunization:update',
      'immunization:cancel',
      'preventive:record',
      'document:read',
      'document:create',
      'document:generate',
      'consent:manage',
      'notification:read',
      'message:send',
      'product:read',
      'stock:read',
      'stock:dispense',
      'report:read',
    ],
    sort: 30,
  },
  {
    key: 'technician',
    name: 'Técnico / Enfermagem',
    description: 'Triagem, sinais vitais, evolução e apoio clínico. Não assina prontuário.',
    clinical: true,
    permissions: [
      'tenant:read',
      'facility:read',
      'professional:read',
      'service:read',
      'search:use',
      'guardian:read',
      'guardian:create',
      'guardian:update',
      'patient:read',
      'patient:create',
      'patient:update',
      'appointment:read',
      'appointment:checkin',
      'encounter:read',
      'record:read_sensitive',
      'encounter:checkin',
      'encounter:create',
      'encounter:update',
      'observation:record_basic',
      'prescription:read',
      'exam_order:read',
      'exam:collect',
      'exam_result:submit',
      'immunization:read',
      'immunization:apply',
      'preventive:record',
      'document:read',
      'document:create',
      'notification:read',
      'product:read',
      'stock:read',
      'stock:dispense',
    ],
    sort: 40,
  },
  {
    key: 'receptionist',
    name: 'Recepção',
    description: 'Cadastro, agenda, check-in com pesagem e check-out. Sem prontuário clínico.',
    clinical: false,
    permissions: [
      'tenant:read',
      'facility:read',
      'professional:read',
      'service:read',
      'search:use',
      'guardian:read',
      'guardian:create',
      'guardian:update',
      'patient:read',
      'patient:create',
      'patient:update',
      'appointment:read',
      'appointment:create',
      'appointment:update',
      'appointment:cancel',
      'appointment:checkin',
      'encounter:read',
      'encounter:checkin',
      'observation:record_basic',
      'immunization:read',
      'preventive:record',
      'document:read',
      'notification:read',
      'message:send',
      'charge:read',
      'payment:create',
    ],
    sort: 50,
  },
  {
    key: 'finance',
    name: 'Financeiro',
    description: 'Faturamento, recebimentos e relatórios financeiros.',
    clinical: false,
    permissions: [
      'tenant:read',
      'facility:read',
      'search:use',
      'guardian:read',
      'patient:read',
      'charge:read',
      'charge:create',
      'invoice:read',
      'invoice:create',
      'invoice:cancel',
      'payment:read',
      'payment:create',
      'payment:refund',
      'cash:close',
      'price:manage',
      'billing:report',
      'report:read',
      'notification:read',
    ],
    sort: 60,
  },
  {
    key: 'inventory',
    name: 'Estoque',
    description: 'Produtos, lotes, movimentações e contagem.',
    clinical: false,
    permissions: [
      'tenant:read',
      'facility:read',
      'search:use',
      'product:read',
      'product:manage',
      'stock:read',
      'stock:receive',
      'stock:dispense',
      'stock:adjust',
      'stock:count',
      'stock:transfer',
      'stock:approve_count',
      'identifier:resolve',
      'identifier:manage',
      'supplier:manage',
      'report:read',
      'notification:read',
    ],
    sort: 70,
  },
  {
    key: 'readonly',
    name: 'Somente leitura',
    description: 'Consulta sem escrita e sem conteúdo clínico sensível.',
    clinical: false,
    permissions: [
      'tenant:read',
      'facility:read',
      'professional:read',
      'service:read',
      'search:use',
      'guardian:read',
      'patient:read',
      'appointment:read',
      'encounter:read',
      'prescription:read',
      'exam_order:read',
      'immunization:read',
      'document:read',
      'notification:read',
      'report:read',
    ],
    sort: 80,
  },
] as const;

export const ROLE_TEMPLATE_BY_KEY: Record<string, RoleTemplate> = Object.fromEntries(
  ROLE_TEMPLATES.map((r) => [r.key, r]),
);

/** Papéis que exigem vínculo com profissional para atuar clinicamente. */
export const CLINICAL_ROLE_KEYS = ROLE_TEMPLATES.filter((r) => r.clinical).map((r) => r.key);

/** Permissões cuja concessão só tem efeito com registro em conselho válido. */
export const LICENSE_REQUIRED_PERMISSIONS = [
  'encounter:sign',
  'prescription:sign',
  'prescription:controlled',
  'exam_result:sign',
  'surgery:sign',
] as const;

/** Operações que exigem reautenticação recente (step-up). */
export const STEP_UP_PERMISSIONS = [
  'role:manage',
  'member:remove',
  'encounter:reopen',
  'guardian:anonymize',
  'tenant:manage_billing',
] as const;

/** Planos comerciais: template de entitlements. */
export interface PlanDefinition {
  key: string;
  name: string;
  modules: ModuleKey[];
  limits: { maxFacilities: number; maxUsers: number; storageGb: number };
  sort: number;
}

export const PLANS: readonly PlanDefinition[] = [
  {
    key: 'solo',
    name: 'Autônomo',
    modules: ['core', 'scheduling', 'clinical', 'immunization', 'documents', 'comms'],
    limits: { maxFacilities: 1, maxUsers: 2, storageGb: 5 },
    sort: 10,
  },
  {
    key: 'clinic',
    name: 'Clínica',
    modules: [
      'core',
      'scheduling',
      'clinical',
      'lab',
      'immunization',
      'documents',
      'comms',
      'inventory',
      'reports',
      'billing',
    ],
    limits: { maxFacilities: 3, maxUsers: 15, storageGb: 50 },
    sort: 20,
  },
  {
    key: 'hospital',
    name: 'Hospital',
    modules: [...MODULE_KEYS],
    limits: { maxFacilities: 5, maxUsers: 60, storageGb: 200 },
    sort: 30,
  },
  {
    key: 'enterprise',
    name: 'Rede',
    modules: [...MODULE_KEYS],
    limits: { maxFacilities: 100, maxUsers: 1000, storageGb: 2000 },
    sort: 40,
  },
] as const;

export const PLAN_BY_KEY: Record<string, PlanDefinition> = Object.fromEntries(PLANS.map((x) => [x.key, x]));

export type EntitlementState = 'active' | 'trial' | 'suspended' | 'disabled';

/**
 * Resolve as dependências de um conjunto de módulos: habilitar um módulo
 * exige que suas dependências estejam habilitadas.
 */
export function missingModuleDependencies(enabled: readonly ModuleKey[]): Array<{ module: ModuleKey; missing: ModuleKey[] }> {
  const set = new Set<ModuleKey>(enabled);
  const problems: Array<{ module: ModuleKey; missing: ModuleKey[] }> = [];
  for (const key of enabled) {
    const def = MODULE_BY_KEY[key];
    if (!def) continue;
    const missing = def.dependsOn.filter((d) => !set.has(d));
    if (missing.length > 0) problems.push({ module: key, missing });
  }
  return problems;
}

/** Módulos habilitados que dependem do módulo informado. */
export function dependentModules(target: ModuleKey, enabled: readonly ModuleKey[]): ModuleKey[] {
  return enabled.filter((k) => MODULE_BY_KEY[k]?.dependsOn.includes(target));
}
