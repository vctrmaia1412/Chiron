-- ============================================================================
-- 0008 - Manutenção do cadastro sem beco sem saída
--
-- A recepção precisa corrigir o cadastro sem apagar história:
--
--   patients.inactive_reason / inactivated_at / inactivated_by
--       Paciente que deixou de ser cliente (ou foi transferido) sai dos
--       seletores de agenda e atendimento, mas continua na busca e no
--       prontuário. O motivo aparece na ficha; reativar limpa os três.
--
--   guardians.inactive_reason / inactivated_at / inactivated_by
--       Tutor inativo não entra em vínculo novo nem aparece nos seletores.
--       deleted_at continua reservado para exclusão e anonimização (LGPD).
--
--   patient_identifiers.removed_at / removed_by
--       Microchip digitado errado sai da ficha sem apagar a linha. A
--       unicidade passa a valer só para identificador em uso: o número certo
--       pode ser cadastrado de novo, inclusive em outro animal.
--
--   patient_alerts.deactivated_at / deactivated_by
--       Quem desligou o alerta e quando, para o alerta que some da ficha.
-- ============================================================================

ALTER TABLE registry.patients
  ADD COLUMN inactive_reason text,
  ADD COLUMN inactivated_at timestamptz,
  ADD COLUMN inactivated_by uuid;

ALTER TABLE registry.guardians
  ADD COLUMN inactive_reason text,
  ADD COLUMN inactivated_at timestamptz,
  ADD COLUMN inactivated_by uuid;

ALTER TABLE registry.patient_identifiers
  ADD COLUMN removed_at timestamptz,
  ADD COLUMN removed_by uuid;

ALTER TABLE registry.patient_identifiers
  DROP CONSTRAINT patient_identifiers_tenant_id_scheme_value_key;
CREATE UNIQUE INDEX patient_identifiers_in_use_uq
  ON registry.patient_identifiers (tenant_id, scheme, value)
  WHERE removed_at IS NULL;

ALTER TABLE registry.patient_alerts
  ADD COLUMN deactivated_at timestamptz,
  ADD COLUMN deactivated_by uuid;
