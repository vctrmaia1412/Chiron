-- ============================================================================
-- 0005 - Senha dos papéis de banco vinda de configuração, não do arquivo
--
-- A migração 0001 criou os papéis da aplicação com uma senha de
-- desenvolvimento escrita no próprio SQL. Isso é aceitável para subir o
-- ambiente local em um comando, e inaceitável em qualquer outro lugar: o
-- arquivo está no versionamento.
--
-- Aqui a senha passa a vir de `chiron.role_password`, definido pelo migrador
-- a partir de DATABASE_ROLE_PASSWORD antes de aplicar as migrações. Em
-- produção o migrador exige a variável; em desenvolvimento ele usa o valor
-- padrão para não quebrar o fluxo de um comando.
--
-- Migração aplicada não se edita, então a correção vem como passo novo.
-- ============================================================================

DO $$
DECLARE
  role_password text := current_setting('chiron.role_password', true);
BEGIN
  IF role_password IS NULL OR role_password = '' THEN
    RAISE EXCEPTION
      'Defina DATABASE_ROLE_PASSWORD antes de migrar: os papéis de banco não podem ficar com senha de exemplo.';
  END IF;

  EXECUTE format('ALTER ROLE chiron_app PASSWORD %L', role_password);
  EXECUTE format('ALTER ROLE chiron_iam PASSWORD %L', role_password);
  EXECUTE format('ALTER ROLE chiron_admin PASSWORD %L', role_password);
END
$$;
