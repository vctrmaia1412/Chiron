# 0011 - Papéis do sistema são catálogo global

Status: aceito

## Contexto

Os oito papéis do sistema (proprietário, administrador, veterinário, técnico,
recepção, financeiro, estoque e somente leitura) nascem de `ROLE_TEMPLATES`, em
`packages/contracts`. Até aqui, a única rotina que os materializava era o seed
de demonstração, que copiava os oito para dentro de cada organização, com todas
as permissões de cada um.

O efeito prático era grave: organização criada fora do seed nascia sem papel
nenhum. A lista de papéis vinha vazia, o seletor da tela de equipe vinha vazio,
e o convite falhava com "papel desconhecido". Como o seed se recusa a rodar em
produção, não havia caminho para colocar a segunda clínica no ar.

Havia ainda o custo silencioso da cópia: mudar uma permissão de um papel
significava reescrever a mesma linha em toda organização já existente, e
qualquer organização que ficasse para trás passava a operar com uma matriz de
permissões diferente das demais, sem ninguém perceber.

`iam.roles` já aceitava `tenant_id` nulo, a política de RLS já era da família
catálogo híbrido (linha global visível para todos, linha do tenant visível só
para ele), e as consultas de convite e de troca de papel já resolviam papel
global. Faltava apenas alguém criar as linhas.

## Decisão

Papel do sistema é catálogo global, sincronizado junto com módulos, permissões,
planos, espécies e exames, na mesma rotina de dados de referência que roda em
toda migração. Uma linha por papel, com `tenant_id` nulo, e `iam.role_permissions`
convergindo para o template: insere o que falta, remove o que saiu.

Organização criada por qualquer caminho, seed ou provisionamento, apenas aponta
para o papel global. Papel próprio da clínica continua possível, com `tenant_id`
preenchido, e tem precedência sobre o global de mesma chave.

## Consequências

Aceitas:

- Alterar uma permissão de papel do sistema passa a valer para todas as
  organizações na migração seguinte, sem varredura e sem divergência.
- Organização nova nasce utilizável: convite funciona no primeiro minuto.
- A cópia por organização deixa de existir, e com ela o risco de duas
  organizações com o mesmo papel se comportarem de forma diferente.

Custos:

- Banco de desenvolvimento semeado antes desta decisão continua com as cópias
  antigas, e a lista de papéis mostra cada chave duas vezes até um `db:reset`.
  A limpeza automática não foi feita de propósito: apagar linha de `iam.roles`
  cascateia para `iam.membership_roles` e deixaria membros sem papel.
- A clínica perde a possibilidade de editar diretamente um papel do sistema.
  Para personalizar, o caminho é duplicar o papel dentro da organização, o que
  é mais seguro: o catálogo permanece uma referência estável.

## Alternativas consideradas

**Manter a cópia por organização.** Descartada: era a causa do problema e
espalhava a matriz de permissões por N organizações, sem ganho.

**Criar os papéis dentro do provisionamento.** Resolveria a organização nova,
mas manteria a divergência entre organizações antigas e novas e repetiria a
regra em dois lugares.
