# 0008 - Eventos por outbox transacional

Status: aceito

## Contexto

Efeitos colaterais precisam acontecer depois de um fato clínico: avisar a
equipe de que um resultado saiu, lembrar de um retorno, cancelar agenda futura
de um paciente que morreu.

Fazer isso dentro da requisição acopla o tempo de resposta a serviços externos
e cria a pior falha possível: o fato gravado e o efeito perdido, ou o efeito
disparado e a transação revertida.

## Decisão

Padrão outbox. O evento é gravado em `platform.domain_events` na mesma
transação do fato. Ou os dois existem, ou nenhum existe.

O worker entrega, com trava por linha (`FOR UPDATE SKIP LOCKED`), o que permite
várias réplicas sem processar o mesmo evento duas vezes. Falha conta tentativa,
guarda o erro, e ao esgotar o limite marca como morto para inspeção.

Evento sem reação registrada é considerado entregue, não erro: a outbox também
serve de trilha e de ponto de extensão para integração futura.

## Consequências

Aceitas:

- entrega é eventual, não imediata;
- a tabela cresce e precisa de rotina de expurgo do que já foi publicado;
- o worker precisa de um papel de banco com leitura entre organizações.

Ganhas:

- nenhum efeito se perde por falha de rede no meio da requisição;
- a requisição responde rápido;
- integração nova não exige tocar em quem publica o evento.

## Não implementado

Envio de e-mail e de WhatsApp. Existe apenas notificação interna. Um handler
que fingisse enviar seria pior que a ausência dele.
