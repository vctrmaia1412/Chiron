# 0005 - Check-in cria o atendimento na mesma transação

Status: aceito

## Contexto

Agendamento e atendimento são entidades distintas: um é intenção, o outro é o
ato clínico. Faltava definir quem cria o atendimento e quando.

Alternativas:

1. o veterinário cria ao começar a atender;
2. a recepção cria no check-in;
3. criação preguiçosa, na primeira escrita clínica.

A opção 1 deixa o paciente invisível na fila entre a chegada e o início. A
opção 3 espalha a criação por vários caminhos, cada um com chance de esquecer
alguma inicialização.

## Decisão

O check-in cria o atendimento, na mesma transação em que marca a chegada.

Na mesma transação também entra o peso aferido na recepção, que passa a valer
para o cálculo de dose. É o motivo de o peso ser pedido ali e não depois.

O atendimento nasce em `arrived`. Atendimento sem agendamento (walk-in,
urgência) tem caminho próprio, que cria diretamente.

## Consequências

Aceitas:

- paciente que desiste antes de ser atendido deixa um atendimento cancelado, e
  não apenas um agendamento cancelado;
- a recepção passa a criar registro clínico, o que exige permissão adequada.

Ganhas:

- a fila mostra quem está esperando desde a chegada;
- o tempo de espera é mensurável;
- o peso está disponível quando a prescrição acontece.
