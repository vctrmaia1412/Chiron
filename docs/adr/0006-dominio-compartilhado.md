# 0006 - Regras clínicas em pacote compartilhado

Status: aceito

## Contexto

O frontend precisa mostrar a dose calculada enquanto o veterinário digita. O
backend precisa recalcular, porque entrada de cliente não é confiável.

Duas implementações da mesma regra divergem. Em cálculo de dose, divergir
significa a tela mostrar um número e o sistema gravar outro.

## Decisão

Um pacote `@chiron/domain`, sem I/O e sem dependência de framework, com as
regras que precisam valer nos dois lados:

- conversão e normalização de unidades;
- cálculo de dose por peso;
- cruzamento de alergia por princípio ativo normalizado;
- máquinas de estado;
- conteúdo mínimo por tipo de serviço;
- leitura de identificadores.

Junto, `@chiron/contracts` com os schemas Zod, permissões, módulos e códigos de
erro. O mesmo schema valida no formulário e no servidor.

## Consequências

Aceitas:

- os dois pacotes precisam ser compilados antes de API e web;
- mudança neles afeta os dois lados ao mesmo tempo, o que exige atenção em
  compatibilidade.

Ganhas:

- a regra tem uma implementação só, com teste de unidade próprio;
- o servidor continua sendo a autoridade: ele recalcula, não confia no valor
  recebido;
- a permissão que o frontend consulta é literalmente a chave que o backend
  exige, porque vem da mesma constante.
