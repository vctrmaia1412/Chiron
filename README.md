# CHIRON

Plataforma de gestão clínica veterinária: prontuário, agenda, atendimento,
receita, exames, vacinas e documentos, com isolamento entre organizações
garantido no banco de dados.

O sistema atende cão, gato, ave, réptil, equino, bovino, silvestre e exótico.
Espécie não é um campo de texto: define painel de sinais vitais, unidade de
peso, faixas de referência, atributos próprios e regras de carência.

## Como rodar

Requisitos: Node 24, pnpm 10 e Docker.

```bash
git clone <repo> && cd app
pnpm install
cp .env.example .env          # ajuste os segredos antes de qualquer ambiente real
pnpm infra:up                 # postgres, redis, minio e mailpit
pnpm db:migrate               # migrações e dados de referência
pnpm db:seed                  # dados de demonstração (nunca roda em produção)
pnpm dev                      # api em :3333 e web em :3000
```

Abra `http://localhost:3000` e entre com `vet@chiron.dev` / `Chiron@2026`.
Os demais acessos aparecem na saída do `db:seed`.

### Pilha completa em contêiner

API, worker, web, banco, cache, armazenamento e proxy, tudo atrás de uma
origem só:

```bash
pnpm stack:up                 # http://localhost:8080
pnpm stack:logs
pnpm stack:down
```

## O que está pronto

| Área | Situação |
| --- | --- |
| Multi-tenancy com RLS no PostgreSQL | funcionando e coberto por teste |
| Autenticação, sessão e RBAC | funcionando |
| Cadastro de tutores e pacientes multiespécie | funcionando |
| Agenda, check-in e fila de atendimento | funcionando |
| Atendimento, prontuário por eventos e linha do tempo | funcionando |
| Receita com dose por peso, alergia e carência | funcionando |
| Exames com resultado e revisão | funcionando |
| Vacinas, preventivos e pendências | funcionando |
| Documentos em PDF e upload com URL assinada | funcionando |
| Auditoria e log de acesso | funcionando |
| Estoque, faturamento, internação e cirurgia | não implementado |

O estado detalhado, com o que falta e por quê, está em
[`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md).

## Arquitetura em uma tela

```
apps/
  api/       NestJS sobre Fastify. Módulos por domínio, um banco compartilhado.
  worker/    Entrega de eventos da outbox e tarefas periódicas.
  web/       Next.js App Router, mobile-first, consome só a API.
packages/
  contracts/ Schemas Zod, permissões, módulos e códigos de erro.
  domain/    Regras puras: unidades, dose, máquinas de estado, conteúdo mínimo.
  config/    TypeScript compartilhado.
infra/
  compose/   Ambiente local e pilha completa.
  proxy/     Caddy, origem única para web e API.
```

Monólito modular, não microsserviços. Cada módulo tem fronteira clara e fala
com os outros por serviço ou por evento, nunca por acesso direto à tabela do
vizinho.

## Decisões que orientam o código

**O tenant vem da sessão, nunca do cliente.** O `tenant_id` enviado pelo
navegador serve só como confirmação: se divergir da sessão, a requisição é
recusada com `CONTEXT_MISMATCH`. No banco, Row Level Security garante que uma
consulta sem filtro continue isolada. Sem contexto de tenant, o papel da
aplicação lê zero linhas.

**Autorização fecha por padrão.** Rota sem `@Authorize` e sem `@Public` é
negada. A cadeia verifica, nesta ordem: sessão, organização ativa, módulo
habilitado, permissão, escopo de unidade e registro de conselho quando a ação
é assinatura clínica. O frontend só reflete o que o servidor decidiu.

**Registro clínico assinado não é sobrescrito.** Correção cria nova versão que
supersede a anterior, e a anterior continua no prontuário. Vale para nota,
receita e resultado de exame. Auditoria e log de acesso são append-only por
trigger, inclusive para o dono do banco.

**Prontuário é composto, não é um campo grande.** A linha do tempo é montada
por união sobre as tabelas de origem. Não existe tabela paralela de eventos
para desenhar tela.

**Nada de dado clínico no dispositivo.** A sessão é cookie httpOnly e todo
estado vem da API. O navegador não guarda prontuário.

## Documentação

- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md): instalação, comandos, banco,
  testes, variáveis de ambiente e como trabalhar no projeto.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): módulos, multi-tenancy, RBAC,
  autenticação e fluxo clínico.
- [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md): pronto, em
  andamento, bloqueado e próximo.
- [`docs/PLANO_DE_LANCAMENTO.md`](docs/PLANO_DE_LANCAMENTO.md): o que falta
  para vender, como colocar no ar sem custo, até onde a pilha gratuita
  sustenta e como escalar. Fonte de verdade da próxima etapa.
- [`docs/adr/`](docs/adr/): decisões arquiteturais com contexto e alternativas.
- [`docs/CHIRON_MASTER_ANALYSIS.md`](docs/CHIRON_MASTER_ANALYSIS.md): análise
  que originou o projeto.

## Comandos

| Comando | O que faz |
| --- | --- |
| `pnpm dev` | API e web em modo de desenvolvimento |
| `pnpm build` | Compila tudo |
| `pnpm typecheck` | Verificação de tipos em todos os pacotes |
| `pnpm lint` | ESLint em todos os pacotes |
| `pnpm test` | Testes de unidade |
| `pnpm test:integration` | Testes de integração contra PostgreSQL real |
| `pnpm db:migrate` | Aplica migrações e dados de referência |
| `pnpm db:seed` | Dados de demonstração |
| `pnpm db:reset` | Recria o banco do zero |
| `pnpm infra:up` / `infra:down` | Serviços de apoio locais |
| `pnpm stack:up` / `stack:down` | Pilha completa em contêiner |

## Segurança e privacidade

Segredos vêm de variável de ambiente e não entram no versionamento. CPF e CNPJ
ficam cifrados em coluna com AES-256-GCM e são pesquisáveis por índice cego
HMAC. Toda leitura de prontuário entra no log de acesso. Exportação e
anonimização de dados pessoais estão implementadas para atender pedidos de
titular previstos na LGPD, preservando o histórico clínico, que é registro de
guarda obrigatória.

A conformidade jurídica depende de política interna, contrato e processo da
clínica: o sistema oferece os controles técnicos, não uma declaração de
conformidade.
