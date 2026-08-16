# Desenvolvimento

Guia prático para trabalhar no CHIRON: subir o ambiente, entender o banco,
rodar teste e saber onde mexer.

## Requisitos

- Node 24 (a versão está fixada em `.nvmrc`)
- pnpm 10 (`npm install -g pnpm@10`)
- Docker com Compose

## Primeira execução

```bash
pnpm install
cp .env.example .env
pnpm infra:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`pnpm dev` sobe a API em `http://localhost:3333` e o web em
`http://localhost:3000`.

Se a porta 5433 ou 6380 já estiver ocupada na sua máquina, ajuste
`POSTGRES_PORT` e a `REDIS_URL` no `.env`. As portas alternativas são
propositais: evitam conflito com PostgreSQL e Redis instalados localmente.

## Estrutura

```
apps/api        NestJS + Fastify. Cada módulo em src/modules/<área>.
apps/worker     Relay da outbox e tarefas periódicas.
apps/web        Next.js App Router. Rotas em src/app, componentes em src/components.
packages/contracts  Schemas Zod compartilhados, permissões, módulos, erros.
packages/domain     Regras puras, sem I/O. Tudo aqui tem teste de unidade.
packages/config     tsconfig base.
infra/compose   Ambiente local (dev) e pilha completa.
infra/proxy     Caddy.
```

Regra de dependência: `web` e `api` dependem de `contracts` e `domain`.
`contracts` e `domain` não dependem de nada do projeto. Se uma regra clínica
precisa valer nos dois lados, ela mora em `domain`.

## Banco de dados

### Migrações

Arquivos `NNNN_nome.sql` em `apps/api/migrations`, aplicados em ordem, cada um
em sua transação, com hash registrado em `platform.schema_migrations`.

**Migração aplicada não se edita.** O migrador compara o hash e aborta se o
arquivo mudou. Para corrigir algo, crie a próxima migração.

```bash
pnpm db:migrate     # aplica pendentes e sincroniza dados de referência
pnpm db:reset       # derruba os schemas e refaz tudo (só em ambiente local)
```

### Dados de referência e seed

São coisas diferentes:

- **Dados de referência** (`src/database/reference-data.ts`): módulos, planos,
  permissões, espécies, raças, códigos de observação e catálogo de exames.
  Fazem parte do produto, rodam junto da migração e são idempotentes. A fonte
  são os contratos versionados, então o banco não sai de sincronia com o
  código.
- **Seed** (`src/database/seed-data.ts`): duas organizações de demonstração
  com equipe, tutores, pacientes de espécies variadas, agenda, atendimentos,
  exames e vacinas. Nunca roda em produção: o guard verifica `APP_ENV` e
  `NODE_ENV` e aborta.

O seed cria dois tenants de propósito. O segundo existe para conferir na
prática que um usuário de uma organização não enxerga nada da outra.

### Papéis de banco

| Papel | Uso | RLS |
| --- | --- | --- |
| `chiron_app` | caminho normal de requisição | aplicado |
| `chiron_iam` | login, convite, redefinição de senha | aplicado |
| `chiron_admin` | relay da outbox e tarefas do worker | contornado (BYPASSRLS) |
| `chiron_owner` | apenas migrações | dono das tabelas |

O papel da aplicação não desliga RLS e não apaga auditoria. Há teste para isso.

### Guarda de schema

```bash
pnpm --filter @chiron/api exec tsx src/database/verify-rls.ts
```

Percorre todas as tabelas dos schemas da aplicação e verifica se a família
declarada em `platform.rls_policy_registry` bate com a realidade: RLS
habilitado e forçado, políticas presentes, coluna `tenant_id` onde a família
exige. Também confirma que, sem contexto de tenant, o papel da aplicação lê
zero linhas.

Ao criar tabela nova, declare a família no registro. A guarda falha se
esquecer, o que é o objetivo.

## Testes

```bash
pnpm test               # unidade (regras de domínio)
pnpm test:integration   # integração contra PostgreSQL real
```

Os testes de integração criam o banco `chiron_test` do zero a cada execução,
aplicam migração, dados de referência e seed. Não tocam no banco de
desenvolvimento.

Três arquivos, três propósitos:

- `tenant-isolation.integration.test.ts`: ataca o PostgreSQL diretamente com o
  papel da aplicação. Se o RLS falhar aqui, nada acima importa.
- `authorization.integration.test.ts`: mesma pergunta na borda HTTP, mais
  papéis, entitlement de módulo e validação de entrada.
- `clinical-flow.integration.test.ts`: o fluxo do consultório de ponta a ponta,
  do cadastro ao prontuário.

Para ver o erro real da API durante um teste:

```bash
TEST_LOG_LEVEL=error pnpm test:integration
```

O runner de integração usa SWC porque o esbuild não emite metadados de
decorator, e sem eles a injeção de dependência do Nest não resolve.

## Verificações antes de commitar

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Variáveis de ambiente

Todas em `.env.example`, com valores de desenvolvimento. O arquivo `.env` está
fora do versionamento.

| Variável | Para que serve |
| --- | --- |
| `DATABASE_URL` | conexão do papel da aplicação |
| `DATABASE_IAM_URL` | conexão do módulo de identidade |
| `DATABASE_ADMIN_URL` | conexão do worker (cross-tenant) |
| `DATABASE_MIGRATION_URL` | conexão do dono, só para migração |
| `SESSION_SECRET` | HMAC do identificador de sessão |
| `COLUMN_ENCRYPTION_KEY` | cifra de CPF e CNPJ (AES-256-GCM) |
| `COLUMN_HASH_KEY` | índice cego para busca por documento |
| `S3_*` | armazenamento de arquivos (MinIO local) |
| `PUBLIC_APP_URL` | origem do frontend, usada em CORS e CSRF |
| `EXTRA_ALLOWED_ORIGINS` | origens extras, separadas por vírgula |
| `COOKIE_SECURE` | cookie só em HTTPS (ligue em produção) |

Em produção, gere os segredos com `openssl rand -base64 48` e guarde fora do
repositório.

## Como o frontend conversa com a API

Tudo passa por `src/lib/api.ts`. A sessão viaja em cookie httpOnly, então o
JavaScript nunca vê o token. Mutação envia `X-Chiron-Tenant` como confirmação
da organização ativa; se divergir da sessão, o servidor recusa.

Permissões e módulos vêm de `/me/context` e servem só para não oferecer ação
que seria negada. Não são autorização: a decisão é sempre do servidor.

Estado de servidor fica no TanStack Query. Estado de formulário fica no
componente, e formulário em folha só existe enquanto está aberto, para nascer
sempre limpo.

## Convenções

- Mensagem de erro em português, voltada a quem opera a clínica.
- Código de erro estável em `packages/contracts/src/errors.ts`. Se o frontend
  precisa distinguir um caso, ele merece um código.
- Toda mutação relevante grava auditoria na mesma transação do fato.
- Nada de `console.log` no caminho de requisição: use o logger estruturado.
- Comentário explica o porquê, não o quê.

## Problemas comuns

**A API sobe mas toda rota devolve 500 com `getAllAndOverride`.** Você está
rodando com um runtime que não emite metadados de decorator (tsx/esbuild). Use
`pnpm dev` (Nest CLI) ou `node dist/main.js`.

**Login funciona mas a lista de organizações vem vazia.** A consulta precisa
rodar com `app.user_id` definido; sem contexto, o RLS devolve zero linhas, que
é o comportamento correto.

**Docker não sobe o `migrate`.** Verifique se `POSTGRES_PASSWORD`,
`REDIS_PASSWORD`, `SESSION_SECRET`, `COLUMN_ENCRYPTION_KEY` e
`COLUMN_HASH_KEY` estão no `.env`. O compose falha cedo e com mensagem clara
quando falta segredo, de propósito.
