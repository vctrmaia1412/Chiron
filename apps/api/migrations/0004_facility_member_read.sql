-- ============================================================================
-- 0004 - Leitura de unidades pelo membro sem tenant ativo
--
-- Contexto: na tela de escolha de organização (logo após o login) ainda não há
-- tenant ativo, mas a interface precisa listar as unidades de cada organização
-- em que o usuário é membro. A política de isolamento de `platform.facilities`
-- exige `tenant_id = current_tenant_id()`, então a lista vinha vazia.
--
-- Solução: uma política adicional apenas de SELECT, restrita a tenants onde o
-- usuário tem vínculo ativo. Escrita continua exclusivamente sob o tenant
-- ativo (a política `tenant_isolation`, FOR ALL, não é afetada). A tabela passa
-- para a família `tenant_user`, que é exatamente esta semântica: dado de tenant
-- legível pelo usuário que pertence a ele.
--
-- Não há recursão de políticas: a política de `iam.memberships` já permite
-- `user_id = platform.current_user_id()` e não referencia `facilities`.
-- ============================================================================

CREATE POLICY member_read ON platform.facilities
  FOR SELECT
  USING (
    tenant_id = platform.current_tenant_id()
    OR EXISTS (
      SELECT 1
        FROM iam.memberships m
       WHERE m.tenant_id = platform.facilities.tenant_id
         AND m.user_id = platform.current_user_id()
         AND m.status = 'active'
    )
  );

UPDATE platform.rls_policy_registry
   SET family = 'tenant_user'
 WHERE table_schema = 'platform' AND table_name = 'facilities';
