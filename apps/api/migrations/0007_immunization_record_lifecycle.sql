-- ============================================================================
-- 0007 - Vacina e preventivo fora da consulta: dose de outro local e cancelamento
--
-- Na rotina a vacina e o vermífugo nem sempre passam por uma consulta: a dose
-- é aplicada no balcão, ou o tutor traz a carteira de outra clínica e a
-- recepção transcreve o histórico. E o registro errado precisava de um jeito
-- de sair das pendências sem ser apagado.
--
--   administered_elsewhere  dose aplicada fora da clínica (histórico trazido
--                           pelo tutor). Não tem profissional da casa, não gera
--                           cobrança e por isso nunca fica presa a atendimento.
--   external_location       onde foi aplicada (clínica, campanha, cidade).
--   external_professional   quem aplicou, como consta na carteira.
--   cancel_reason           motivo do cancelamento. Até aqui o motivo ia
--   cancelled_at            colado em `reaction_notes`, misturado à reação.
--   cancelled_by_user_id
--
-- `preventive_treatments` ganha o `status` que o documento de domínio já
-- previa (mesmo vocabulário de `immunizations`): o registro cancelado continua
-- no histórico como `entered_in_error` e deixa de gerar próxima aplicação.
-- ============================================================================

ALTER TABLE immunization.immunizations
  ADD COLUMN administered_elsewhere boolean NOT NULL DEFAULT false,
  ADD COLUMN external_location text,
  ADD COLUMN external_professional text,
  ADD COLUMN cancel_reason text,
  ADD COLUMN cancelled_at timestamptz,
  ADD COLUMN cancelled_by_user_id uuid,
  ADD CONSTRAINT immunizations_elsewhere_no_encounter
    CHECK (NOT administered_elsewhere OR encounter_id IS NULL);

-- Cancelamentos anteriores a esta migração: o motivo estava no fim das notas.
UPDATE immunization.immunizations
   SET cancel_reason = COALESCE(substring(reaction_notes FROM 'Cancelado: (.*)$'), 'Motivo não informado')
 WHERE status = 'entered_in_error' AND cancel_reason IS NULL;

ALTER TABLE immunization.preventive_treatments
  ADD COLUMN status text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('completed', 'not_done', 'entered_in_error')),
  ADD COLUMN administered_elsewhere boolean NOT NULL DEFAULT false,
  ADD COLUMN external_location text,
  ADD COLUMN external_professional text,
  ADD COLUMN cancel_reason text,
  ADD COLUMN cancelled_at timestamptz,
  ADD COLUMN cancelled_by_user_id uuid,
  ADD CONSTRAINT preventive_elsewhere_no_encounter
    CHECK (NOT administered_elsewhere OR encounter_id IS NULL);

-- O índice de pendências passa a ignorar o preventivo cancelado, como já
-- acontecia com a vacina.
DROP INDEX immunization.preventive_due_idx;
CREATE INDEX preventive_due_idx ON immunization.preventive_treatments (tenant_id, next_due_at)
  WHERE next_due_at IS NOT NULL AND status = 'completed';
