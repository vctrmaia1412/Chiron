# Relatório de implementação

Sessão de 16 de agosto de 2026. O que foi construído, o que funciona, o que
não existe e o que vem depois.

## Resumo

O CHIRON saiu de um protótipo visual com dados fictícios e virou uma
aplicação com banco, API, worker, frontend e infraestrutura reproduzível.

A régua adotada foi simples: só conta como pronto o que atravessa a corrente
inteira, de interface a banco e de volta. Se eu cadastro um paciente, ele
existe na tabela. Se abro o prontuário, vejo o histórico real montado a partir
dos registros clínicos. Se recarrego a página, continua lá. Se outro usuário
entra, vê o mesmo. Se um usuário de outra clínica tenta, recebe 404.

Fluxo demonstrável verificado contra a aplicação em execução, em 20 passos:

```
LOGIN → TENANT → PAINEL → PACIENTE + TUTOR → AGENDAMENTO → CHECK-IN
→ SINAIS VITAIS → ATENDIMENTO → NOTA CLÍNICA → DIAGNÓSTICO → CONDUTA
→ RECEITA (dose 7,2 mg calculada por peso) → ASSINATURA → PDF
→ EXAME → FINALIZAÇÃO → REGISTRO IMUTÁVEL → PRONTUÁRIO → LINHA DO TEMPO
→ ISOLAMENTO ENTRE ORGANIZAÇÕES
```

Todos passaram.

## Arquitetura construída

Monólito modular, não microsserviços, porque as operações centrais atravessam
áreas dentro de uma transação: o check-in marca chegada e abre atendimento; a
finalização assina notas, sela o registro e lança cobrança.

```
apps/api        NestJS sobre Fastify, 13.982 linhas, 123 rotas em /api/v1
apps/worker     Relay de outbox e tarefas periódicas, 520 linhas
apps/web        Next.js App Router, 11.532 linhas
packages/contracts  Schemas Zod, permissões, módulos, erros, 2.600 linhas
packages/domain     Regras puras com teste próprio, 1.544 linhas
apps/api/migrations SQL versionado, 2.134 linhas
apps/api/test       Integração contra PostgreSQL real, 1.220 linhas
```

228 arquivos versionados, 16 commits organizados por funcionalidade.

## Módulos implementados

| Módulo | Entrega |
| --- | --- |
| Identidade | login, sessão opaca, convite, troca de organização, equipe, papéis |
| Organização | dados, unidades, entitlements de módulo |
| Cadastro | tutores, pacientes multiespécie, espécies, raças, profissionais, serviços |
| Agenda | bloqueios, conflito, confirmação, cancelamento, falta, check-in, retornos |
| Clínico | atendimento, triagem, notas, sinais vitais, diagnósticos, procedimentos, receitas, prontuário, linha do tempo |
| Laboratório | pedido, coleta, envio, resultado, retificação, revisão |
| Imunização | vacinas, preventivos, pendências de próxima dose |
| Documentos | upload assinado, verificação de conteúdo, 11 modelos de PDF, consentimentos |
| Painel | métricas do dia com origem única e destino clicável |
| Busca | busca global e leitura de código por câmera, leitor ou digitação |
| Notificações | avisos internos |
| Auditoria | trilha de ações e histórico de acesso a dado sensível |

## Banco de dados

80 tabelas em 11 schemas. Quatro migrações versionadas com verificação de
hash: migração já aplicada que for editada aborta o processo em vez de gerar
divergência silenciosa entre ambientes.

**Isolamento em três camadas independentes:**

1. a consulta filtra por organização;
2. se esquecer o filtro, o Row Level Security filtra;
3. se tentar referenciar dado de outra organização, a chave estrangeira
   composta `(tenant_id, id)` recusa.

O contexto vem da sessão e é aplicado com `set_config(..., true)`
parametrizado. Nunca há interpolação de string em SQL. O papel da aplicação
não tem `BYPASSRLS`, não é dono das tabelas, e `FORCE ROW LEVEL SECURITY` vale
para ele.

Uma guarda automática percorre todas as tabelas e recusa qualquer uma sem
família declarada ou com política incoerente. Tabela nova sem declaração faz a
verificação falhar, que é o objetivo.

**Imutabilidade imposta pelo banco**, não só pela aplicação: triggers recusam
alteração de nota assinada, de receita assinada e de resultado liberado fora
das transições válidas. Auditoria e log de acesso são append-only, inclusive
para o dono do banco.

**Sobreposição de agenda** é impedida por restrição de exclusão com índice
GiST, com escape explícito para encaixe.

Dados de referência sincronizados a partir dos contratos versionados: 12
módulos, 4 planos, 121 permissões, 18 espécies, 98 raças, 16 códigos de
observação, 21 exames e 23 faixas de referência. O banco não sai de sincronia
com o código porque a fonte é a mesma.

## Segurança

- Sessão opaca no servidor, identificada pelo HMAC do token. Vazamento da
  tabela de sessões não permite reconstruir credencial.
- Cookie httpOnly, SameSite Lax, Secure em produção. O JavaScript nunca vê o
  token.
- Senha com argon2id, bloqueio por tentativas, resposta uniforme para e-mail
  inexistente e senha errada.
- Autorização fail closed: rota sem declaração é negada. A cadeia verifica
  sessão, organização, módulo, permissão, escopo de unidade e registro de
  conselho quando a ação é assinatura clínica.
- Toda negativa de acesso entra na auditoria.
- O tenant enviado pelo cliente é confirmação, nunca autoridade: divergência
  em relação à sessão resulta em `CONTEXT_MISMATCH`.
- CPF e CNPJ cifrados em coluna com AES-256-GCM e prefixo de versão de chave,
  pesquisáveis por índice cego HMAC com chave separada.
- Validação de entrada no servidor com os mesmos schemas usados no formulário.
- Upload confere magic bytes contra o tipo declarado antes de liberar o
  arquivo; download só por URL assinada de curta duração, com registro no log
  de acesso.
- Segredos vêm de variável de ambiente. Nenhuma credencial no versionamento.
- Nenhum dado clínico é guardado no navegador.

## LGPD

Controles técnicos implementados: controle de acesso por permissão, log de
todo acesso a prontuário, minimização (a listagem mostra documento mascarado e
não decifra nada no caminho comum), exportação de dados do titular,
anonimização irreversível de dados pessoais preservando o histórico clínico, e
registro de consentimento com data, método e evidência.

O sistema oferece os controles. A conformidade depende de política, contrato e
processo da clínica, e isso o software não declara por ela.

## Testes

**85 testes de unidade** sobre as regras puras: conversão de unidades,
normalização de sinais vitais, cálculo de dose por peso, cruzamento de
alergia, máquinas de estado, conteúdo mínimo por tipo de serviço e leitura de
identificadores.

**58 testes de integração** contra PostgreSQL real, em banco recriado do zero a
cada execução:

- *Isolamento entre organizações no banco* (obrigatório): sem contexto lê zero
  linhas; o tenant A não vê, não altera e não apaga dado do tenant B; consulta
  que esquece o filtro continua isolada; gravar ou referenciar registro de
  outra organização é recusado; o papel da aplicação não desliga RLS nem apaga
  auditoria.
- *Autorização na borda HTTP*: sessão, papéis, entitlement de módulo,
  confirmação de organização, validação de entrada.
- *Fluxo clínico completo*: 21 passos, do cadastro ao prontuário.

Cinco defeitos reais foram encontrados pelos próprios testes e corrigidos:
soma de contadores concatenando texto, adendo violando índice de nota ativa,
negativa de autorização não auditada, identificador malformado retornando 500,
e unidades fora do contrato compartilhado no seed.

O lint do React 19 encontrou um sexto: formulários zerando estado dentro de
efeito, padrão que em certa ordem de eventos reabre a folha com resto do
preenchimento anterior. Corrigido em todo o frontend.

## Infraestrutura

Ambiente local com PostgreSQL 16, Redis, MinIO e Mailpit em portas
alternativas, para não conflitar com instalações da máquina.

Pilha completa em contêiner, verificada de ponta a ponta: banco, cache,
armazenamento, migração como passo bloqueante, API, worker, web e proxy. Tudo
atrás de uma origem só, o que deixa o cookie de sessão same-origin e dispensa
CORS em produção.

Imagens em múltiplos estágios, rodando com usuário sem privilégio, sem código
fonte nem ferramenta de build na camada final.

Reprodutibilidade verificada: clone, instalação, ambiente, migração, seed e
execução.

## O que está funcionando

Login com escolha de organização. Painel do dia com números que têm origem
única e destino clicável. Cadastro de tutor e paciente de qualquer das oito
espécies, com atributos próprios, microchip, brinco, SISBOV, anilha,
passaporte, alergias, alertas e curva de peso. Agenda com conflito detectado
pelo banco. Check-in que abre o atendimento e registra o peso. Triagem com
painel de sinais vitais que muda conforme a espécie. Notas por seção com
salvamento automático. Diagnósticos. Receita com dose calculada pelo peso,
alerta de alergia, carência para animais de produção e assinatura que gera PDF
arquivado. Exames com resultado e retificação que preserva a versão anterior.
Vacinas com pendência de próxima dose. Prontuário composto e linha do tempo
derivada das fontes de verdade. Documentos com upload em duas etapas e onze
modelos de PDF. Auditoria e log de acesso. Configuração de organização,
equipe, módulos e catálogos.

Mobile de verdade a partir de 320 px: barra inferior ao alcance do polegar,
folha inferior no lugar de diálogo central, tabela que vira cartão, campo com
16 px para não disparar zoom no iOS, área segura respeitada, alvo de toque de
44 px e formulário que o teclado virtual não destrói.

## O que não está pronto

Estoque, faturamento, internação, cirurgia, portal do tutor, envio de e-mail e
WhatsApp, integração com laboratório, DICOM e relatórios gerenciais.

Nada disso aparece como botão inerte ou tela vazia. O que não existe não é
oferecido.

Detalhe de cada item, com o motivo, em
[`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md).

## Riscos

**Sem verificação de vírus no upload.** O tipo declarado é conferido contra os
bytes, mas nenhum scanner está ligado. Integrar antes de liberar upload a
usuário externo.

**Sem limite de taxa.** A configuração existe e o Redis está no ambiente, mas o
middleware não foi implementado. O login já bloqueia por tentativas, o que
cobre o caso mais crítico.

**Hash de integridade não é assinatura eletrônica.** Comprova que o conteúdo
não mudou; não substitui certificado ICP-Brasil. O PDF sai com linha para
assinatura e carimbo.

**Faixas de referência iniciais não são validadas.** Por decisão de projeto,
aparecem como informativas até a clínica validar. Isso é correto, mas exige
configuração antes de haver alerta confiável.

**Sem política de retenção por tipo de documento.** O worker já expurga sessão,
token e upload abandonado, mas não há retenção por categoria de documento.

## Próximos passos

1. Limite de taxa por IP e por conta, usando o Redis que já está no ambiente.
2. Lembrete por WhatsApp a partir das pendências que já são calculadas.
3. Estoque, começando por lote e validade de vacina, que já são registrados
   mas não controlados.
4. Faturamento sobre os itens de cobrança que o atendimento já gera.
5. Relatórios gerenciais.
6. Testes de navegador sobre o fluxo clínico.

## Como conferir

```bash
pnpm install
cp .env.example .env
pnpm infra:up
pnpm db:migrate && pnpm db:seed
pnpm dev
```

Entre em `http://localhost:3000` com `vet@chiron.dev` / `Chiron@2026`.

Para verificar as garantias em vez de acreditar nelas:

```bash
pnpm test              # 85 testes de regra clínica
pnpm test:integration  # 58 testes contra PostgreSQL real
pnpm --filter @chiron/api exec tsx src/database/verify-rls.ts
```
