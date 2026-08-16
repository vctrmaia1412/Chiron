# Arquitetura

## Forma geral

Monólito modular. Um processo de API, um worker, um frontend e um banco
compartilhado. Não são microsserviços: o custo operacional não se justifica no
tamanho do problema, e a coerência transacional entre agenda, atendimento e
prontuário é justamente o que o produto precisa preservar.

```
navegador
   |
   v
proxy (origem única)
   |            \
   v             v
web (Next.js)   api (NestJS/Fastify) ---> PostgreSQL
                      |                      ^
                      | outbox               |
                      v                      |
                   worker  ------------------+
```

O worker é o único componente com leitura entre organizações, e existe
justamente porque precisa varrer todas elas.

## Módulos

| Módulo | Responsabilidade |
| --- | --- |
| `identity` | login, sessão, convite, troca de organização, equipe |
| `tenant` | organização, unidades, entitlements de módulo |
| `registry` | tutores, pacientes, espécies, raças, profissionais, serviços |
| `scheduling` | agenda, bloqueios, check-in, retornos |
| `clinical` | atendimento, notas, sinais vitais, diagnósticos, receitas, prontuário |
| `lab` | pedidos de exame, coleta, resultado, revisão |
| `immunization` | vacinas, preventivos, pendências de próxima dose |
| `documents` | armazenamento, upload assinado, geração de PDF, consentimentos |
| `dashboard` | painel operacional do dia |
| `search` | busca global e leitura de código |
| `notifications` | avisos internos |
| `audit` | consulta de auditoria e de log de acesso |

Módulo é também uma unidade comercial: cada organização tem um conjunto de
entitlements, e o backend recusa a rota quando o módulo está desligado. Não é
um interruptor visual.

## Multi-tenancy

Banco compartilhado, schema compartilhado, isolamento por linha.

Cada tabela declara uma família em `platform.rls_policy_registry`:

| Família | Regra |
| --- | --- |
| `tenant` | `tenant_id = current_tenant_id()` para leitura e escrita |
| `tenant_user` | além do tenant ativo, o próprio usuário enxerga suas linhas |
| `catalog` | linhas globais (`tenant_id IS NULL`) mais as do tenant |
| `global` | sem `tenant_id`, sem RLS |
| `outbox` | escrita com tenant, leitura cross-tenant só pelo papel do worker |

O contexto vem da sessão e é aplicado por `set_config(..., true)`, equivalente
transacional de `SET LOCAL`, sempre parametrizado. Nunca há interpolação de
string em SQL.

```
platform.current_tenant_id() = NULLIF(current_setting('app.tenant_id', true), '')::uuid
```

O `NULLIF` é deliberado: sem contexto, a função devolve `NULL`, nenhuma linha
casa, e a leitura vem vazia em vez de estourar erro de cast.

Chaves estrangeiras são compostas por `(tenant_id, id)`. Assim o banco recusa,
por construção, um atendimento apontando para paciente de outra organização.

Três garantias, em camadas independentes:

1. a consulta filtra por tenant;
2. se esquecer o filtro, o RLS filtra;
3. se tentar referenciar dado de outra organização, a chave composta recusa.

Há teste para as três.

## Autenticação e sessão

Sessão opaca do lado do servidor. O cookie carrega um token aleatório; o banco
guarda o HMAC desse token, então vazamento da tabela não permite reconstruir a
sessão. Cookie `httpOnly`, `SameSite=Lax`, `Secure` em produção.

Senha com argon2id. Tentativa malsucedida conta e bloqueia temporariamente.
Resposta uniforme para e-mail inexistente e senha errada.

Invalidação por versão: alterar papel ou permissão incrementa `perm_version`, e
a sessão é reavaliada na requisição seguinte, sem precisar esperar expirar.

Ações sensíveis exigem reautenticação recente (step-up).

## Autorização

Cadeia única, no guard, que fecha por padrão:

```
sessão válida
  -> organização ativa
  -> módulo habilitado (entitlement)
  -> permissão (recurso:ação)
  -> escopo de unidade
  -> registro de conselho, quando é assinatura clínica
```

Rota sem `@Authorize` e sem `@Public` é negada. Esquecer de declarar vira erro
fechado, não brecha.

Permissão é `recurso:ação` e cada uma pertence a um módulo. Papel é um conjunto
de permissões. O frontend recebe a lista pronta e a usa apenas para não
oferecer o que seria negado.

Toda negativa entra na auditoria. É justamente a tentativa recusada que
interessa em uma investigação.

## Fluxo clínico

Agenda e atendimento são coisas distintas. `appointments` é intenção;
`encounters` é o ato clínico. O check-in cria o atendimento na mesma transação
em que marca a chegada, e registra o peso aferido, que passa a valer para o
cálculo de dose.

```
agendamento -> check-in -> atendimento (aguardando)
  -> triagem (sinais vitais) -> em andamento
  -> notas, diagnósticos, procedimentos, receita, exames, vacinas
  -> finalização: assina notas, sela com hash e lança cobrança
```

A finalização exige conteúdo mínimo conforme o tipo de serviço. Consulta sem
avaliação nem diagnóstico não fecha; vacinação sem aplicação registrada não
fecha. Existe saída consciente: uma justificativa explícita, que fica gravada.

### Prontuário

Não é um registro grande por paciente. É composto por eventos reais, cada um em
sua tabela: notas, observações, diagnósticos, procedimentos, receitas, exames,
vacinas, documentos e óbito.

A linha do tempo é uma união sobre essas tabelas, com redação por
sensibilidade. Não existe tabela paralela de eventos criada só para desenhar a
tela: isso viraria uma segunda fonte de verdade capaz de divergir da primeira.

### Imutabilidade

Nota assinada, receita assinada e resultado liberado não são sobrescritos.
Correção cria uma nova versão que supersede a anterior, e a anterior continua
consultável, marcada como substituída. Trigger no banco valida as transições:
a regra não depende do código da aplicação lembrar dela.

Auditoria e log de acesso são append-only por trigger, inclusive para o dono do
banco.

## Domínio compartilhado

`packages/domain` concentra o que precisa valer igual nos dois lados:

- conversão e normalização de unidades (peso em grama ou quilo, temperatura em
  Celsius ou Fahrenheit, glicemia em mg/dL ou mmol/L);
- cálculo de dose por peso, que recusa dose por quilo sem peso registrado em
  vez de assumir um valor;
- cruzamento de alergia por princípio ativo normalizado;
- máquinas de estado de agendamento, atendimento, nota, receita e exame;
- conteúdo mínimo por tipo de serviço;
- leitura de identificadores: microchip ISO, GS1, GTIN, código interno.

O frontend mostra a dose calculada e o servidor recalcula com a mesma função.
Não há duas implementações para divergir.

### Faixas de referência

Faixa de referência nasce como `unvalidated` e aparece como indicação
informativa. Só depois que a clínica valida é que o sistema trata o valor como
parâmetro clínico. O contrário seria o software afirmar normalidade sobre uma
tabela genérica.

## Documentos e arquivos

Arquivo não vai para o banco. Vai para armazenamento S3 compatível, com chave
prefixada por organização. Upload em duas etapas: o servidor registra o
documento e devolve uma URL assinada de curta duração; depois confere os bytes
recebidos contra o tipo declarado antes de liberar. Download também só por URL
assinada emitida pelo backend, com registro no log de acesso.

PDF é gerado no servidor com PDFKit, de forma síncrona, porque são documentos de
balcão. O hash serve para conferir integridade; não é assinatura eletrônica com
valor jurídico, e o documento sai com linha para assinatura e carimbo.

## Eventos

Evento de domínio é gravado na mesma transação do fato que o originou, na
tabela `platform.domain_events`. Ou os dois existem, ou nenhum existe.

O worker entrega com trava por linha (`FOR UPDATE SKIP LOCKED`), o que permite
várias réplicas sem processamento duplicado. Falha conta tentativa, guarda o
erro e, ao esgotar o limite, marca como morto para inspeção.

Evento sem reação registrada é entrega concluída, não erro: a outbox guarda o
fato para auditoria e para integrações futuras.

## Observabilidade

Log estruturado com pino, com redação de campos que costumam vazar por engano.
Todo request recebe um id de correlação, devolvido no cabeçalho `x-request-id`
e repetido no corpo do erro, para que o suporte ligue a reclamação ao log.

`/api/v1/health` responde sobre o processo. `/api/v1/ready` verifica o banco. O
worker tem os seus, incluindo a fila da outbox.

## O que não existe

Estoque, faturamento, internação, cirurgia, portal do tutor, integração com
laboratório, envio de e-mail e WhatsApp, e DICOM. As tabelas de estoque e
cobrança existem no schema porque o atendimento já lança item de cobrança, mas
não há módulo funcional acima delas.

Nada disso está simulado na interface. Botão que não faz nada é pior que
ausência de botão.
