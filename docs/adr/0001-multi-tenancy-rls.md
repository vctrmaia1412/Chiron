# 0001 - Banco compartilhado com Row Level Security

Status: aceito

## Contexto

Uma clínica não pode ver dado de outra. A consequência de errar aqui não é bug
de tela: é vazamento de prontuário.

Três formas de isolar:

1. **Banco por organização.** Isolamento máximo, custo operacional alto:
   migração multiplicada, conexão multiplicada, relatório entre organizações
   praticamente inviável.
2. **Schema por organização.** Custo intermediário, mesmo problema de migração
   e um limite prático de algumas centenas de schemas antes do catálogo do
   PostgreSQL pesar.
3. **Banco e schema compartilhados, isolamento por linha.** Operação simples,
   e o risco concentrado em uma pergunta: alguém pode esquecer o filtro?

## Decisão

Banco e schema compartilhados, com `tenant_id` e Row Level Security forçado.

O contexto vem da sessão, aplicado por `set_config('app.tenant_id', $1, true)`
no início da transação. O papel da aplicação não tem `BYPASSRLS` e não é dono
das tabelas, então `FORCE ROW LEVEL SECURITY` vale para ele.

Chaves estrangeiras são compostas por `(tenant_id, id)`, de modo que o banco
recusa referência cruzada entre organizações mesmo que a política falhe.

Uma guarda de schema verifica, a cada execução, se toda tabela tem família
declarada e política coerente. Tabela nova sem declaração faz a guarda falhar.

## Consequências

Aceitas:

- toda conexão precisa passar por `withTenant`; acesso direto ao pool é
  exceção que exige justificativa;
- o worker precisa de um papel separado com `BYPASSRLS`, já que varre todas as
  organizações;
- consulta que envolve dado global e dado de tenant precisa de política de
  catálogo, com duas regras.

Ganhas:

- consulta que esquece o filtro continua isolada;
- migração é uma só;
- o teste de isolamento ataca o banco diretamente, sem depender do código da
  aplicação estar correto.

## Alternativa descartada

Filtrar apenas na aplicação. Funciona até o dia em que alguém escreve uma
consulta nova sem o `WHERE`. O custo de RLS é pequeno perto disso.
