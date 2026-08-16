# 0010 - Faixa de referência começa informativa

Status: aceito

## Contexto

Marcar um sinal vital como alterado exige uma faixa de referência. Faixa varia
por espécie, idade, porte, método de aferição e laboratório.

Distribuir uma tabela genérica e tratá-la como verdade faz o software afirmar
que um valor está alterado sem base na realidade daquela clínica. Em medicina
isso não é um detalhe de configuração.

## Decisão

Toda faixa tem `validation_status`, que começa como `unvalidated`.

Enquanto não validada, o sistema mostra a indicação como informativa, com
marcação explícita, e não a trata como parâmetro clínico. A clínica valida cada
faixa, registrando quem validou e quando, ou substitui pela faixa do próprio
laboratório.

O produto entrega faixas iniciais de literatura geral para as espécies mais
comuns, todas marcadas como não validadas.

## Consequências

Aceitas:

- exige um passo de configuração antes de a clínica ter alerta confiável;
- a interface precisa de dois estados visuais para o mesmo tipo de informação.

Ganhas:

- o sistema não afirma normalidade ou alteração sem respaldo;
- a responsabilidade clínica fica onde deve estar;
- laboratório próprio pode ter faixa própria, que é o caso real.
