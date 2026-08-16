-- =============================================================================
-- CHIRON | Migração 0003 - Fecha lacunas apontadas pela guarda de schema
--
-- iam.invitations e iam.terms_acceptances têm tenant_id e estavam sem RLS.
-- Invitations precisa ser legível na rota pública de aceite, que roda com
-- `SET LOCAL app.invitation_token_hash` (nunca com o tenant do cliente).
-- =============================================================================

CREATE OR REPLACE FUNCTION platform.current_invitation_token() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.invitation_token_hash', true), '')
$$;

-- ------------------------------------------------------------- invitations
ALTER TABLE iam.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam.invitations FORCE ROW LEVEL SECURITY;

CREATE POLICY invitation_tenant_read ON iam.invitations
  FOR SELECT
  USING (
    tenant_id = platform.current_tenant_id()
    OR token_hash = platform.current_invitation_token()
  );

CREATE POLICY invitation_tenant_write ON iam.invitations
  FOR ALL
  USING (
    tenant_id = platform.current_tenant_id()
    OR token_hash = platform.current_invitation_token()
  )
  WITH CHECK (
    tenant_id = platform.current_tenant_id()
    OR token_hash = platform.current_invitation_token()
  );

-- ------------------------------------------------------- terms_acceptances
ALTER TABLE iam.terms_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam.terms_acceptances FORCE ROW LEVEL SECURITY;

CREATE POLICY terms_read ON iam.terms_acceptances
  FOR SELECT
  USING (
    user_id = platform.current_user_id()
    OR (tenant_id IS NOT NULL AND tenant_id = platform.current_tenant_id())
  );

CREATE POLICY terms_write ON iam.terms_acceptances
  FOR ALL
  USING (user_id = platform.current_user_id())
  WITH CHECK (user_id = platform.current_user_id());

UPDATE platform.rls_policy_registry SET family = 'tenant_user'
  WHERE table_schema = 'iam' AND table_name IN ('invitations', 'terms_acceptances');

-- audit.audit_log aceita tenant_id nulo para eventos de plataforma (login antes
-- de escolher organização). A política de tenant continua valendo: linhas sem
-- tenant só são legíveis pelo papel administrativo, o que é o comportamento
-- desejado. Declara a família explicitamente para a guarda de schema.
UPDATE platform.rls_policy_registry SET family = 'tenant'
  WHERE table_schema = 'audit' AND table_name = 'audit_log';
