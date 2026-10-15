-- ============================================================================
-- 0006 - Ciclo de vida do convite: reenviar e revogar
--
-- Até aqui o convite só conhecia "pendente" e "aceito". Convidar de novo o
-- mesmo e-mail regravava o token em silêncio, matando o link que a pessoa já
-- tinha recebido, e não havia como cancelar um convite enviado por engano.
--
--   sent_at     último envio do link. O reenvio troca o token e atualiza
--               este campo; created_at continua sendo a data do convite.
--   revoked_at  convite cancelado pela clínica. Link revogado não aceita.
--   revoked_by  quem revogou, para a investigação.
--
-- O índice de unicidade de convite em aberto passa a ignorar os revogados:
-- revogar e convidar de novo o mesmo e-mail é o caminho normal de correção.
-- ============================================================================

-- O default já cobre as linhas existentes: a migração não depende de o UPDATE
-- abaixo enxergar todas elas (a tabela tem RLS forçado).
ALTER TABLE iam.invitations
  ADD COLUMN sent_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN revoked_at timestamptz,
  ADD COLUMN revoked_by uuid REFERENCES iam.users(id);

-- Convite anterior a esta migração foi enviado quando foi criado.
UPDATE iam.invitations SET sent_at = created_at;

DROP INDEX iam.invitations_pending_uq;
CREATE UNIQUE INDEX invitations_pending_uq
  ON iam.invitations (tenant_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
