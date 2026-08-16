-- =============================================================================
-- CHIRON | Migração 0001 - Fundação (platform, iam, audit, profissionais)
-- Referência: docs/CHIRON_MASTER_ANALYSIS.md, seções 9.2, 9.11, 9.13 e 10.3
--
-- Papéis:
--   chiron_owner    dono das tabelas, usado apenas por migrações/seed
--   chiron_app      API e worker: sem BYPASSRLS, sujeito às políticas
--   chiron_iam      módulo identity: acesso às tabelas globais de identidade
--   chiron_admin    relay da outbox e jobs cross-tenant (BYPASSRLS)
--
-- Famílias de política RLS (seção 9.13):
--   1  dado de tenant            tenant_id = contexto
--   1b dado de tenant + usuário  memberships/tenants legíveis pelo próprio usuário
--   2  catálogo híbrido          global (tenant_id NULL) + do tenant
--   3  global de identidade      sem RLS, acesso mediado pelo módulo identity
--   4  outbox                    escrita pelo app, leitura cross-tenant pelo relay
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE SCHEMA IF NOT EXISTS platform;
CREATE SCHEMA IF NOT EXISTS iam;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS registry;

-- ----------------------------------------------------------------- helpers
-- Contexto da transação. NULLIF evita erro de cast quando o parâmetro já
-- existe na sessão com valor vazio (conexão devolvida ao pool).
CREATE OR REPLACE FUNCTION platform.current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION platform.current_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION platform.set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Bloqueia UPDATE/DELETE em tabelas append-only (auditoria, ledger).
CREATE OR REPLACE FUNCTION platform.deny_write() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Tabela append-only: % não é permitido em %', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

-- Sequência legível por tenant (paciente 1, atendimento 1, ...).
CREATE OR REPLACE FUNCTION platform.next_number(p_tenant_id uuid, p_kind text) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE
  v_value bigint;
BEGIN
  INSERT INTO platform.tenant_counters (tenant_id, kind, last_value)
  VALUES (p_tenant_id, p_kind, 1)
  ON CONFLICT (tenant_id, kind)
  DO UPDATE SET last_value = platform.tenant_counters.last_value + 1
  RETURNING last_value INTO v_value;
  RETURN v_value;
END;
$$;

-- ---------------------------------------------------------------- platform
CREATE TABLE platform.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE platform.modules (
  key text PRIMARY KEY,
  name text NOT NULL,
  depends_on text[] NOT NULL DEFAULT '{}',
  always_on boolean NOT NULL DEFAULT false,
  sort integer NOT NULL DEFAULT 0
);

CREATE TABLE platform.plan_modules (
  plan_id uuid NOT NULL REFERENCES platform.plans(id) ON DELETE CASCADE,
  module_key text NOT NULL REFERENCES platform.modules(key) ON DELETE CASCADE,
  PRIMARY KEY (plan_id, module_key)
);

CREATE TABLE platform.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'trial'
    CHECK (status IN ('trial', 'active', 'suspended', 'closed')),
  plan_id uuid REFERENCES platform.plans(id),
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  locale text NOT NULL DEFAULT 'pt-BR',
  data_region text NOT NULL DEFAULT 'br-1',
  database_ref text NOT NULL DEFAULT 'shared',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  perm_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE TABLE platform.tenant_counters (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  kind text NOT NULL,
  last_value bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, kind)
);

CREATE TABLE platform.legal_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  person_type text NOT NULL DEFAULT 'company' CHECK (person_type IN ('individual', 'company')),
  legal_name text NOT NULL,
  trade_name text,
  document_encrypted text,
  document_hash text,
  document_masked text,
  tax_regime text,
  address jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (tenant_id, id)
);
CREATE UNIQUE INDEX legal_entities_document_uq
  ON platform.legal_entities (tenant_id, document_hash)
  WHERE document_hash IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE platform.facilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  legal_entity_id uuid REFERENCES platform.legal_entities(id),
  name text NOT NULL,
  code text NOT NULL,
  kind text NOT NULL DEFAULT 'clinic'
    CHECK (kind IN ('office', 'clinic', 'hospital', 'mobile', 'farm_visit')),
  address jsonb,
  phone text,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  is_default boolean NOT NULL DEFAULT false,
  allow_schedule_overlap boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code)
);

CREATE TABLE platform.tenant_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  module_key text NOT NULL REFERENCES platform.modules(key),
  state text NOT NULL DEFAULT 'active'
    CHECK (state IN ('active', 'trial', 'suspended', 'disabled')),
  source text NOT NULL DEFAULT 'plan' CHECK (source IN ('plan', 'addon', 'trial', 'manual')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  grace_until timestamptz,
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  granted_by_user_id uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, module_key)
);

CREATE TABLE platform.feature_flags (
  key text PRIMARY KEY,
  description text,
  default_state boolean NOT NULL DEFAULT false
);

CREATE TABLE platform.feature_flag_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key text NOT NULL REFERENCES platform.feature_flags(key) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('global', 'tenant', 'facility', 'user', 'percentage')),
  target_id text,
  enabled boolean NOT NULL DEFAULT true
);

CREATE TABLE platform.encryption_keys (
  id integer PRIMARY KEY,
  purpose text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz
);

CREATE TABLE platform.domain_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  aggregate_table text NOT NULL,
  aggregate_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  dead_at timestamptz
);
CREATE INDEX domain_events_unpublished_idx
  ON platform.domain_events (occurred_at)
  WHERE published_at IS NULL AND dead_at IS NULL;
CREATE INDEX domain_events_tenant_idx ON platform.domain_events (tenant_id, occurred_at DESC);

CREATE TABLE platform.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  related_table text,
  related_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON platform.notifications (tenant_id, user_id, created_at DESC);

CREATE TABLE platform.data_subject_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  guardian_id uuid,
  kind text NOT NULL CHECK (kind IN ('access', 'rectify', 'delete', 'portability', 'revoke_consent', 'object', 'info_sharing')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz NOT NULL DEFAULT (now() + interval '15 days'),
  verified_by uuid,
  verification_method text,
  resolved_at timestamptz,
  outcome text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------- iam
CREATE TABLE iam.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  password_hash text,
  name text NOT NULL,
  phone text,
  avatar_url text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'disabled')),
  mfa_enabled boolean NOT NULL DEFAULT false,
  mfa_secret_encrypted text,
  is_platform_staff boolean NOT NULL DEFAULT false,
  failed_login_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  locale text NOT NULL DEFAULT 'pt-BR',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE iam.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES platform.tenants(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  description text,
  template_key text,
  template_version integer NOT NULL DEFAULT 1,
  is_system boolean NOT NULL DEFAULT false,
  requires_license boolean NOT NULL DEFAULT false,
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (tenant_id, key)
);

CREATE TABLE iam.permissions (
  key text PRIMARY KEY,
  module_key text NOT NULL REFERENCES platform.modules(key),
  description text NOT NULL
);

CREATE TABLE iam.role_permissions (
  role_id uuid NOT NULL REFERENCES iam.roles(id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES iam.permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_key)
);

CREATE TABLE registry.professionals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES iam.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  council text,
  council_number text,
  council_state text,
  council_valid_until date,
  specialties text[] NOT NULL DEFAULT '{}',
  signature_document_id uuid,
  color text,
  is_external boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (tenant_id, id)
);
CREATE UNIQUE INDEX professionals_council_uq
  ON registry.professionals (tenant_id, council, council_number, council_state)
  WHERE council_number IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX professionals_tenant_idx ON registry.professionals (tenant_id) WHERE deleted_at IS NULL;

CREATE TABLE iam.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'suspended')),
  is_owner boolean NOT NULL DEFAULT false,
  professional_id uuid,
  all_facilities boolean NOT NULL DEFAULT true,
  default_facility_id uuid,
  perm_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id),
  UNIQUE (tenant_id, id),
  CONSTRAINT memberships_professional_fk
    FOREIGN KEY (tenant_id, professional_id) REFERENCES registry.professionals (tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT memberships_facility_fk
    FOREIGN KEY (tenant_id, default_facility_id) REFERENCES platform.facilities (tenant_id, id) ON DELETE SET NULL
);
CREATE INDEX memberships_user_idx ON iam.memberships (user_id);

CREATE TABLE iam.membership_roles (
  membership_id uuid NOT NULL REFERENCES iam.memberships(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES iam.roles(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  PRIMARY KEY (membership_id, role_id)
);

CREATE TABLE iam.membership_facilities (
  membership_id uuid NOT NULL REFERENCES iam.memberships(id) ON DELETE CASCADE,
  facility_id uuid NOT NULL REFERENCES platform.facilities(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  PRIMARY KEY (membership_id, facility_id)
);

CREATE TABLE iam.sessions (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  principal_type text NOT NULL DEFAULT 'staff'
    CHECK (principal_type IN ('staff', 'platform_staff', 'integration', 'guardian_portal')),
  active_tenant_id uuid REFERENCES platform.tenants(id) ON DELETE CASCADE,
  active_membership_id uuid REFERENCES iam.memberships(id) ON DELETE CASCADE,
  active_facility_id uuid REFERENCES platform.facilities(id) ON DELETE SET NULL,
  tenant_perm_version integer,
  membership_perm_version integer,
  impersonation_grant_id uuid,
  auth_time timestamptz NOT NULL DEFAULT now(),
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX sessions_user_idx ON iam.sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX sessions_expiry_idx ON iam.sessions (expires_at);

CREATE TABLE iam.password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE iam.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  email citext NOT NULL,
  name text,
  role_id uuid NOT NULL REFERENCES iam.roles(id),
  facility_ids uuid[] NOT NULL DEFAULT '{}',
  all_facilities boolean NOT NULL DEFAULT true,
  professional jsonb,
  token_hash text NOT NULL UNIQUE,
  invited_by uuid REFERENCES iam.users(id),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX invitations_pending_uq
  ON iam.invitations (tenant_id, email)
  WHERE accepted_at IS NULL;

CREATE TABLE iam.impersonation_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  staff_user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  requested_by_user_id uuid REFERENCES iam.users(id),
  approved_by_membership_id uuid REFERENCES iam.memberships(id),
  reason text NOT NULL,
  scope text NOT NULL DEFAULT 'read' CHECK (scope IN ('read', 'read_write')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  approved_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE iam.terms_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES platform.tenants(id) ON DELETE CASCADE,
  document_kind text NOT NULL CHECK (document_kind IN ('terms', 'privacy', 'dpa')),
  version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip text
);

-- ------------------------------------------------------------------- audit
CREATE TABLE audit.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES platform.tenants(id) ON DELETE CASCADE,
  facility_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid,
  actor_membership_id uuid,
  actor_type text NOT NULL DEFAULT 'user'
    CHECK (actor_type IN ('user', 'platform_staff', 'system', 'api_key')),
  on_behalf_of uuid,
  category text NOT NULL
    CHECK (category IN ('mutation', 'sign', 'cancel', 'reopen', 'merge', 'authz_change',
                        'entitlement_change', 'access_denied', 'export', 'auth',
                        'impersonation', 'context_switch')),
  action text NOT NULL,
  entity_schema text,
  entity_table text,
  entity_id uuid,
  before jsonb,
  after jsonb,
  reason text,
  request_id text,
  ip text,
  user_agent text
);
CREATE INDEX audit_log_entity_idx ON audit.audit_log (tenant_id, entity_table, entity_id, occurred_at DESC);
CREATE INDEX audit_log_tenant_idx ON audit.audit_log (tenant_id, occurred_at DESC);
CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit.audit_log
  FOR EACH ROW EXECUTE FUNCTION platform.deny_write();

CREATE TABLE audit.access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid,
  patient_id uuid,
  resource text NOT NULL
    CHECK (resource IN ('encounter', 'record', 'timeline', 'document', 'invoice', 'export', 'search')),
  resource_id uuid,
  purpose text,
  request_id text,
  ip text
);
CREATE INDEX access_log_patient_idx ON audit.access_log (tenant_id, patient_id, occurred_at DESC);
CREATE TRIGGER access_log_append_only
  BEFORE UPDATE OR DELETE ON audit.access_log
  FOR EACH ROW EXECUTE FUNCTION platform.deny_write();

-- --------------------------------------------------------- updated_at trigs
CREATE TRIGGER tenants_updated_at BEFORE UPDATE ON platform.tenants
  FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();
CREATE TRIGGER facilities_updated_at BEFORE UPDATE ON platform.facilities
  FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();
CREATE TRIGGER legal_entities_updated_at BEFORE UPDATE ON platform.legal_entities
  FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();
CREATE TRIGGER entitlements_updated_at BEFORE UPDATE ON platform.tenant_entitlements
  FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();
CREATE TRIGGER users_updated_at BEFORE UPDATE ON iam.users
  FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();
CREATE TRIGGER memberships_updated_at BEFORE UPDATE ON iam.memberships
  FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();
CREATE TRIGGER professionals_updated_at BEFORE UPDATE ON registry.professionals
  FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

-- ------------------------------------------------------------------- roles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chiron_app') THEN
    CREATE ROLE chiron_app LOGIN PASSWORD 'chiron_dev_password' NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chiron_iam') THEN
    CREATE ROLE chiron_iam LOGIN PASSWORD 'chiron_dev_password' NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chiron_admin') THEN
    CREATE ROLE chiron_admin LOGIN PASSWORD 'chiron_dev_password' BYPASSRLS NOINHERIT;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA platform, iam, audit, registry TO chiron_app, chiron_iam, chiron_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA platform, iam, audit, registry
  TO chiron_app, chiron_iam, chiron_admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA platform, iam, audit, registry
  TO chiron_app, chiron_iam, chiron_admin;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA platform TO chiron_app, chiron_iam, chiron_admin;

ALTER DEFAULT PRIVILEGES IN SCHEMA platform, iam, audit, registry
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO chiron_app, chiron_iam, chiron_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA platform, iam, audit, registry
  GRANT USAGE, SELECT ON SEQUENCES TO chiron_app, chiron_iam, chiron_admin;

-- append-only vale também para o app
REVOKE UPDATE, DELETE ON audit.audit_log, audit.access_log FROM chiron_app, chiron_iam, chiron_admin;

-- ------------------------------------------------------------------- RLS
-- Família 1: dado de tenant
ALTER TABLE platform.legal_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.legal_entities FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON platform.legal_entities
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
ALTER TABLE platform.legal_entities ALTER COLUMN tenant_id SET DEFAULT platform.current_tenant_id();

ALTER TABLE platform.facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.facilities FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON platform.facilities
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
ALTER TABLE platform.facilities ALTER COLUMN tenant_id SET DEFAULT platform.current_tenant_id();

ALTER TABLE platform.tenant_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.tenant_counters FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON platform.tenant_counters
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());

ALTER TABLE platform.tenant_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.tenant_entitlements FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON platform.tenant_entitlements
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
ALTER TABLE platform.tenant_entitlements ALTER COLUMN tenant_id SET DEFAULT platform.current_tenant_id();

ALTER TABLE platform.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON platform.notifications
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
ALTER TABLE platform.notifications ALTER COLUMN tenant_id SET DEFAULT platform.current_tenant_id();

ALTER TABLE platform.data_subject_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.data_subject_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON platform.data_subject_requests
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
ALTER TABLE platform.data_subject_requests ALTER COLUMN tenant_id SET DEFAULT platform.current_tenant_id();

ALTER TABLE registry.professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry.professionals FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON registry.professionals
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
ALTER TABLE registry.professionals ALTER COLUMN tenant_id SET DEFAULT platform.current_tenant_id();

ALTER TABLE iam.membership_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam.membership_roles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON iam.membership_roles
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());

ALTER TABLE iam.membership_facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam.membership_facilities FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON iam.membership_facilities
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());

ALTER TABLE iam.impersonation_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam.impersonation_grants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON iam.impersonation_grants
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());

ALTER TABLE audit.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.audit_log FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit.audit_log
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());

ALTER TABLE audit.access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.access_log FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit.access_log
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
ALTER TABLE audit.access_log ALTER COLUMN tenant_id SET DEFAULT platform.current_tenant_id();

-- Família 1b: legível também pelo próprio usuário (login multi-tenant)
ALTER TABLE iam.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam.memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON iam.memberships
  FOR SELECT
  USING (tenant_id = platform.current_tenant_id() OR user_id = platform.current_user_id());
CREATE POLICY tenant_write ON iam.memberships
  FOR ALL
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());

ALTER TABLE platform.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_self ON platform.tenants
  FOR SELECT
  USING (
    id = platform.current_tenant_id()
    OR EXISTS (
      SELECT 1 FROM iam.memberships m
      WHERE m.tenant_id = platform.tenants.id
        AND m.user_id = platform.current_user_id()
        AND m.status = 'active'
    )
  );
CREATE POLICY tenant_write ON platform.tenants
  FOR UPDATE
  USING (id = platform.current_tenant_id())
  WITH CHECK (id = platform.current_tenant_id());

-- Família 2: catálogo híbrido (global + do tenant)
ALTER TABLE iam.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam.roles FORCE ROW LEVEL SECURITY;
CREATE POLICY catalog_read ON iam.roles
  FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = platform.current_tenant_id());
CREATE POLICY catalog_write ON iam.roles
  FOR ALL
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());

-- Família 4: outbox (escrita pelo app com tenant; leitura cross-tenant só no relay)
ALTER TABLE platform.domain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.domain_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON platform.domain_events
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
ALTER TABLE platform.domain_events ALTER COLUMN tenant_id SET DEFAULT platform.current_tenant_id();

-- Família 3 (sem RLS, allowlist): iam.users, iam.sessions, iam.password_reset_tokens,
-- iam.invitations, iam.terms_acceptances, iam.permissions, iam.role_permissions,
-- platform.modules, platform.plans, platform.plan_modules, platform.feature_flags,
-- platform.feature_flag_rules, platform.encryption_keys.
-- Essas tabelas são acessadas apenas pelo módulo identity/catálogo.

-- ------------------------------------------------------ registro de famílias
CREATE TABLE platform.rls_policy_registry (
  table_schema text NOT NULL,
  table_name text NOT NULL,
  family text NOT NULL CHECK (family IN ('tenant', 'tenant_user', 'catalog', 'global', 'outbox')),
  PRIMARY KEY (table_schema, table_name)
);

INSERT INTO platform.rls_policy_registry (table_schema, table_name, family) VALUES
  ('platform', 'legal_entities', 'tenant'),
  ('platform', 'facilities', 'tenant'),
  ('platform', 'tenant_counters', 'tenant'),
  ('platform', 'tenant_entitlements', 'tenant'),
  ('platform', 'notifications', 'tenant'),
  ('platform', 'data_subject_requests', 'tenant'),
  ('platform', 'domain_events', 'outbox'),
  ('platform', 'tenants', 'tenant_user'),
  ('platform', 'modules', 'global'),
  ('platform', 'plans', 'global'),
  ('platform', 'plan_modules', 'global'),
  ('platform', 'feature_flags', 'global'),
  ('platform', 'feature_flag_rules', 'global'),
  ('platform', 'encryption_keys', 'global'),
  ('platform', 'rls_policy_registry', 'global'),
  ('iam', 'users', 'global'),
  ('iam', 'sessions', 'global'),
  ('iam', 'password_reset_tokens', 'global'),
  ('iam', 'invitations', 'global'),
  ('iam', 'terms_acceptances', 'global'),
  ('iam', 'permissions', 'global'),
  ('iam', 'role_permissions', 'global'),
  ('iam', 'roles', 'catalog'),
  ('iam', 'memberships', 'tenant_user'),
  ('iam', 'membership_roles', 'tenant'),
  ('iam', 'membership_facilities', 'tenant'),
  ('iam', 'impersonation_grants', 'tenant'),
  ('audit', 'audit_log', 'tenant'),
  ('audit', 'access_log', 'tenant'),
  ('registry', 'professionals', 'tenant');
