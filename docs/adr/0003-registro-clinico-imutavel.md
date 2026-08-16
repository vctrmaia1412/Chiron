# 0003 - Registro clínico assinado é imutável

Status: aceito

## Contexto

Prontuário é documento. Editar em silêncio o que já foi assinado destrói o
valor do registro: em uma disputa, o que vale é conseguir mostrar o que estava
escrito na data do atendimento, e por quem.

## Decisão

Nota, receita e resultado de exame, uma vez assinados ou liberados, não são
alterados.

Correção cria uma nova versão que supersede a anterior. A anterior continua no
prontuário, marcada como substituída, e aparece recolhida como versão
anterior.

A regra é imposta por trigger no banco, não apenas pelo código da aplicação:

- `clinical.validate_note_transition` recusa update de nota assinada que não
  seja supersessão ou marcação de erro;
- `clinical.validate_prescription_transition` faz o mesmo para receita;
- `audit.audit_log` e `audit.access_log` são append-only por trigger,
  inclusive para o dono do banco.

A finalização do atendimento grava um hash de integridade do conteúdo.

## Consequências

Aceitas:

- corrigir um erro de digitação exige adendo com motivo, o que incomoda;
- o volume cresce, porque nada é apagado;
- a interface precisa mostrar duas versões sem confundir quem lê.

Ganhas:

- o histórico é defensável;
- o trigger protege inclusive contra um caso de uso novo que esqueça a regra.

## Nota sobre assinatura

O hash comprova integridade do conteúdo. Não é assinatura eletrônica com valor
jurídico: não há certificado ICP-Brasil nem carimbo de tempo. O documento em
PDF sai com linha para assinatura e carimbo do profissional. Chamar o hash de
assinatura digital seria afirmar uma conformidade que não existe.
