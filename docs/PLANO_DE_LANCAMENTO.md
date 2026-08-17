# Plano de lançamento do CHIRON

O que falta para vender, como colocar no ar sem custo, até onde a pilha gratuita
sustenta e como escalar conforme entram clientes.

Data de referência: 16 de agosto de 2026. Base: código no commit `bbf737d`
(branch `main`), banco de demonstração com 4 meses de histórico, medições ao
vivo da pilha em contêiner, e páginas oficiais de preço e documentação dos
provedores consultadas nesta data. O módulo de faturamento fica como "em breve"
por decisão de produto, até a negociação com um parceiro.

## Sumário

1. Resumo executivo
2. Como esta análise foi feita
3. Estado do produto, dimensão por dimensão
4. O que falta para vender: lista consolidada
5. Faturamento em breve: como fica sem botão morto
6. O que falta fora do código: empresa, jurídico e comercial
7. Mercado, preço e regulação
8. Como colocar no ar sem custo
9. Até onde a pilha gratuita sustenta
10. Escada de escala
11. Ordem de execução
12. Riscos e o que não fazer
13. Apêndices

---

## 1. Resumo executivo

### O veredito em quatro frases

O CHIRON tem uma base técnica acima do que o mercado de clínica pequena entrega:
multi-tenant com isolamento no banco provado por teste, prontuário imutável com
assinatura e adendo, receita com dose por peso e checagem de alergia, exames com
retificação, vacinas com pendência, onze modelos de PDF, auditoria e LGPD
levados a sério. Ele não é vendável hoje por três motivos que não são de
arquitetura: (a) não existe caminho para uma clínica entrar no sistema sem que
alguém rode SQL à mão, e o e-mail nunca é enviado, então convite e recuperação
de senha morrem no meio; (b) dois defeitos de tela impedem o uso real, o botão
Finalizar do atendimento nunca aparece e toda data sem hora aparece um dia
antes; (c) não existe backup, monitoramento, política de privacidade nem
contrato de operador. Tudo isso é barato de resolver: a estimativa é de 6 a 8
semanas de um desenvolvedor para a primeira onda, com o jurídico e a abertura
da empresa correndo em paralelo.

### Os números

| Medida | Valor |
| --- | --- |
| Achados levantados no código | 183, em 8 dimensões, mais 14 achados adicionais da revisão de completude |
| Confirmados por leitura independente | 101 confirmados, 22 ajustados em status ou gravidade, nenhum refutado por inteiro |
| Bloqueadores de venda (sem isso não se cobra) | 13 |
| Importantes (o cliente reclama na primeira semana) | cerca de 90 |
| Diferenciais | cerca de 45 |
| Esforço estimado da primeira onda | 6 a 8 semanas de um desenvolvedor |
| Custo fixo da pilha gratuita recomendada | R$ 40 por ano (domínio .com.br) |
| Capacidade da pilha gratuita | 8 a 15 clínicas pequenas nas VMs que a Oracle sempre entrega; 40 a 60 na VM ARM, quando houver capacidade |
| Primeiro degrau pago | cerca de US$ 25 a 40 por mês (R$ 130 a 210), ao chegar à terceira clínica pagante |
| Preço sugerido | Essencial R$ 99 por mês até 3 usuários; Clínica R$ 179 até 10 (faixa de mercado verificada: R$ 79 a 129 e R$ 149 a 199) |

### O que já vende (e é verdade, verificado no código)

- Isolamento entre clínicas no banco de dados, com Row Level Security forçada
  em todas as tabelas de tenant, testado atacando o banco diretamente.
- Prontuário que não pode ser reescrito depois de assinado: nota final só muda
  por adendo que preserva a versão anterior, gatilhos no banco impedem apagar.
- Receita com dose calculada por peso, conferência de alergia por princípio
  ativo, carência obrigatória para animal de produção, extra-bula com
  justificativa, duas vias para controlado.
- Cadastro multiespécie real: 18 espécies, atributos por espécie, sinais vitais
  normalizados e faixas de referência por espécie, nome científico para
  silvestres.
- CPF e CNPJ cifrados em coluna com índice cego para busca; exportação e
  anonimização de dados do tutor com trilha de acesso.
- Autorização fail closed em uma cadeia única (módulo, permissão, licença
  profissional, step-up), com toda negativa registrada em auditoria.
- Agenda com impossibilidade de sobreposição por profissional garantida pelo
  banco, com encaixe explícito.
- Sessão opaca em cookie httpOnly, argon2id, bloqueio por tentativas, sem
  token no navegador.
- Pilha leve: API 80 MB, web 65 MB, worker 62 MB, boot em menos de 1 segundo,
  sem Redis, sem estado em processo, cabe em VM de 1 GB.

### Os 13 bloqueadores, em ordem de execução

| # | Bloqueador | Esforço | Onde |
| --- | --- | --- | --- |
| 1 | Botão Finalizar do atendimento nunca aparece: a tela testa a permissão `encounter:finish`, que não existe (a real é `encounter:sign`) | S | `apps/web/src/app/(app)/atendimentos/[id]/page.tsx:137` |
| 2 | Datas sem hora aparecem um dia antes no Brasil (nascimento, próxima dose, validade, retorno) | S | `apps/web/src/lib/format.ts:14-23` |
| 3 | Convite permite agir como outro usuário: o token bruto volta na resposta em qualquer ambiente e o aceite emite sessão para usuário já existente sem pedir senha | S | `members.controller.ts:30-34`; `identity.service.ts:504-528, 617-625` |
| 4 | Criar organização (tenant) fora do seed não existe: nenhum endpoint, tela ou comando | M | `apps/api/src/modules/tenant`, extrair de `seed-data.ts` |
| 5 | Envio de e-mail não existe: convite e redefinição de senha não chegam a ninguém em produção | M | `apps/api` (novo mailer), `SMTP_URL` nunca usada |
| 6 | Páginas de aceite de convite, esqueci senha e redefinir senha não existem no web; o link do convite cai em 404 | S | `apps/web/src/app` (três rotas novas) |
| 7 | Papéis do sistema não são semeados globalmente: tenant novo nasce sem papéis e sem convite possível | S | `apps/api/src/database/reference-data.ts` |
| 8 | Backup e restauração não existem para banco nem documentos, e as chaves de cifra não têm custódia | M | `infra/`, `docs/RUNBOOK.md` |
| 9 | Cadastro e edição de profissional com CRMV não existe; veterinário convidado sem CRMV não finaliza atendimento nem assina receita, e não há como corrigir | M | `apps/api/src/modules/registry/catalog.controller.ts`, `members.service.ts` |
| 10 | Política de privacidade, termos de uso, contrato de operador (DPA) e fluxo de aceite não existem | M | `iam.terms_acceptances` existe, nada grava |
| 11 | URL assinada do S3 aponta para o host interno e leva checksum CRC32: upload quebra fora do MinIO local (R2, B2, S3, OCI) | S | `apps/api/src/modules/documents/storage.service.ts:31-81` |
| 12 | Sem monitoramento nem alerta; `/ready` devolve 200 mesmo degradado; pool sem timeout trava com banco pendurado | S | `health.controller.ts`, `database.service.ts` |
| 13 | Sem limite de taxa em rotas públicas; step-up aceita tentativas ilimitadas | S | `apps/api/src/main.ts` |

Os itens 1, 2, 3, 6, 7, 11, 12 e 13 são de horas a um dia cada. Os itens 4, 5,
9 e 10 são de dois a cinco dias. O item 8 é um dia de infraestrutura mais o
teste de restauração, a custódia das chaves e o texto do procedimento.

Os itens 8, 11, 12 e 13 aparecem nas dimensões como importantes, não como
bloqueadores; estão promovidos aqui porque sem eles o piloto não sai do
notebook. O item 3 veio da revisão de completude: um administrador que convida
o e-mail de um veterinário que já tem conta pode abrir o link ele mesmo e
passar a atuar sob a identidade desse usuário na própria clínica, inclusive
assinando notas e receitas em nome dele. A correção é não devolver o token fora
de desenvolvimento e teste (só enviar por e-mail) e exigir que usuário
existente aceite autenticado ou informe a senha.

### O que isso significa em prazo

- Semanas 1 e 2: bloqueadores 1, 2, 3, 6, 7, 11, 12, 13 e a base de operação
  (CI, backup, monitoramento).
- Semanas 3 a 5: provisionamento de tenant, e-mail, profissional com CRMV,
  aceite de termos, remarcar agendamento, cancelar atendimento, óbito e
  procedimento na tela, resumo de cobrança e módulos "em breve".
- Semanas 6 a 8: piloto com uma clínica real, correções da primeira semana de
  uso, importação de dados, lembretes por WhatsApp em modo manual.
- Em paralelo desde a semana 1: abertura da empresa (ME no Simples, não MEI),
  redação de termos, privacidade e DPA com jurídico, conta no meio de cobrança.

Primeira clínica pagante é realista entre a oitava e a décima semana, com uma ou
duas clínicas piloto usando de graça a partir da quinta.

---

## 2. Como esta análise foi feita

O código foi lido em oito dimensões (onboarding e autoatendimento; produto
clínico; produto de gestão; segurança e LGPD; operação em produção; frontend e
UX; qualidade e testes; portabilidade de infraestrutura). Cada achado traz
arquivo e linha. Nada foi aceito só porque `docs/IMPLEMENTATION_STATUS.md`
dizia que existia: cada lacuna relevante passou por uma segunda leitura
independente que tentou refutá-la procurando no repositório inteiro; 101 foram
confirmadas, 22 tiveram status ou gravidade corrigidos, nenhuma foi refutada
por completo. Ao final, uma revisão de completude procurou o que faltava
(perguntas de comprador, investidor e operador) e conferiu contradições entre
as dimensões; o que ela encontrou está incorporado, em especial o bloqueador 3
e a seção 6.4. As correções da segunda leitura já estão incorporadas aqui.

Medições feitas ao vivo na pilha em contêiner: consumo de memória por processo,
tamanho do banco com 4 meses de uma clínica, bytes por linha das tabelas
clínicas, tempo de boot, comportamento com o banco pausado, URL assinada real
gerada pelo S3.

Preços e limites de provedores foram lidos nas páginas oficiais em 16 de agosto
de 2026 e estão no apêndice A com a URL de cada um. Onde a página oficial não
pôde ser lida ou o dado veio de fonte secundária, isso está marcado.

Convenção de gravidade: **bloqueador** significa que sem isso não dá para
cobrar de um cliente; **importante** significa que o cliente reclama na primeira
semana; **diferencial** é o que ajuda a vender mas não impede. Convenção de
esforço: S até 1 dia; M de 2 a 5 dias; L de 1 a 3 semanas; XL acima de 3
semanas, sempre para um desenvolvedor que conhece o código.

---

## 3. Estado do produto, dimensão por dimensão

Cada seção traz o que está forte (para usar como argumento de venda) e o que
falta, com gravidade e esforço. As tabelas listam só bloqueadores e
importantes; os diferenciais estão consolidados na seção 4.3.

### 3.1 Onboarding e autoatendimento

**Situação.** Não existe caminho de um prospect até o uso sem intervenção de
engenharia. O único código que cria organização é o seed de demonstração, que
se recusa a rodar em produção. A API tem convite, aceite de convite e
redefinição de senha bem implementados, mas o web não tem as páginas
correspondentes, a tela de login não oferece "esqueci minha senha", e nenhum
e-mail é enviado. Para colocar a clínica número 2 no ar hoje, um humano precisa
inserir tenant, entitlements, unidade, oito papéis com centenas de permissões,
usuário com hash argon2id gerado à mão, membership e profissional, direto no
banco, e entregar a senha por WhatsApp.

**Forte.** Modelo multi-tenant completo no banco (tenants com status, planos,
entitlements com expiração, unidades, pessoas jurídicas, memberships, papéis,
convites, tokens, aceite de termos): criar uma clínica é inserir linhas, o
custo marginal por cliente é zero. Convite de equipe robusto (token só como
hash, 14 dias, cria profissional com CRMV na mesma transação). Reset de senha
correto (uso único, 30 minutos, revoga sessões). Login multiorganização com
troca de contexto. Oito papéis prontos com 121 permissões versionadas em
contrato.

| Lacuna | Gravidade | Esforço | Evidência |
| --- | --- | --- | --- |
| Criação de organização fora do seed não existe | Bloqueador | M | `tenant.controller.ts:33-83` só GET/PATCH; `seed-data.ts:521-525` aborta em prod |
| Envio de e-mail não existe | Bloqueador | M | `env.ts:65-66` únicas menções a `SMTP_URL`; sem `nodemailer` no `package.json` |
| Página de aceite de convite não existe (link leva a 404) | Bloqueador | S | `members.controller.ts:30` gera `/convite/:token`; rota ausente em `apps/web/src/app` |
| Redefinição e troca de senha: API existe, UI não; em produção o token some | Bloqueador | S | `identity.controller.ts:48-58`; sem `/esqueci-senha` e `/redefinir-senha` |
| Papéis do sistema não são semeados globalmente | Importante | S | `reference-data.ts:14-181` não insere em `iam.roles` |
| Plano, trial e limites são decorativos (nada aplica `maxUsers`, `maxFacilities`, expiração; suspensão só por módulo) | Importante | M | `session.service.ts:266-278, 300-315`; `members.service.ts:142-193` |
| Painel de módulos lê `moduleKey` mas a API devolve `key`: todos aparecem desligados | Importante | S | `configuracoes/page.tsx:16-21, 154-166` vs `tenant.service.ts:120-142` |
| Administração da plataforma inexistente: `is_platform_staff` não autoriza nada; impersonação sem código | Importante | M | `session.service.ts:196-221`; `iam.impersonation_grants` sem uso |
| Convites pendentes invisíveis: sem listar, reenviar ou revogar | Importante | S | `members.service.ts:19-78` |
| Dono e veterinários sem registro profissional vinculado, sem forma de corrigir | Importante | M | `updateMemberRequestSchema` sem `professional`; `catalog.service.ts:329-359` |
| Sem checklist de primeiro acesso; unidade e pessoa jurídica não configuráveis pela tela | Importante | M | `page.tsx:140-215`; `configuracoes/page.tsx:112-127` |
| Importação de dados de outro sistema não existe | Importante | M | nenhum endpoint de CSV ou lote |
| Termos, privacidade e DPA sem aceite no fluxo | Importante | S | `iam.terms_acceptances` sem uso |

### 3.2 Produto clínico

**Situação.** A base clínica é sólida e vai além do que a maioria dos sistemas
de clínica pequena entrega. Mas há um defeito que impede o uso real: o botão
Finalizar testa uma permissão que não existe, então nenhum usuário consegue
assinar e encerrar um atendimento pela interface; por consequência, a agenda
nunca conclui, os itens de cobrança nunca nascem e o retorno nunca é
registrado. Fora isso, o padrão dominante é endpoint pronto sem tela: remarcar,
cancelar atendimento, registrar procedimento, registrar óbito, vincular tutor,
editar vacina, anexar laudo, bloquear agenda.

**Forte.** Cadastro rápido de tutor com paciente na mesma transação; check-in
que abre o atendimento com peso já valendo para dose; máquina de estados do
atendimento com notas por seção e salvamento automático, hash de integridade,
adendo, reabertura auditada; conteúdo mínimo por categoria de serviço; sinais
vitais por espécie com faixas; receita completa (dose por kg, alergia,
carência, extra-bula, controlado em duas vias, PDF arquivado); assinatura
clínica exige CRMV válido no guard; exames com retificação que supersede e
revisão; vacinas com pendência e botão de aviso por WhatsApp; óbito cancela
agenda futura e suspende pendências; onze modelos de PDF; linha do tempo
derivada das fontes de verdade; busca global e leitura de microchip por câmera;
retornos a agendar em lista própria; gráfico de peso.

| Lacuna | Gravidade | Esforço | Evidência |
| --- | --- | --- | --- |
| Botão Finalizar nunca aparece: `can('encounter:finish')` (inexistente) em vez de `encounter:sign`; idem `note:amend` e `record:read` | Bloqueador | S | `atendimentos/[id]/page.tsx:137, 248`; `pacientes/[id]/page.tsx:116` |
| Remarcar ou editar agendamento não tem tela (API tem PATCH, sem revalidar bloqueio) | Importante | M | `appointments.controller.ts:48-56`; `agenda/page.tsx:227-258` |
| Óbito e eutanásia sem tela | Importante | S | `patients.controller.ts:147-161` sem chamada no web |
| Cancelar atendimento sem tela: fila fica suja quando o tutor desiste | Importante | S | `encounters.controller.ts:89-97` |
| Procedimentos e notas cirúrgicas sem tela: castração e limpeza de tártaro só fecham com justificativa | Importante | M | `encounters.controller.ts:142-150`; `note-editor.tsx:12` |
| Reabrir atendimento falha após 5 minutos de login (step-up não tratado) | Importante | S | `atendimentos/[id]/page.tsx:390-444` |
| Profissional responsável travado: outro veterinário não consegue finalizar | Importante | S | `encounters.service.ts:878-886` |
| Retornos nunca saem da lista e notificação de retorno nunca dispara | Importante | S | `appointments.service.ts:251-257`; `handlers.ts:69-81` |
| Bloqueio de agenda e grade de horários sem endpoint nem tela | Importante | M | `schedule_blocks` só consultado em `appointments.service.ts:206-214` |
| Agenda só em lista diária, sem grade semanal, sem horários livres | Importante | L | `agenda/page.tsx:41-52, 149-264` |
| Sem lembrete automático ao tutor (consulta, vacina, retorno) | Importante | L | `handlers.ts:8-12`; só link manual `wa.me` |
| Vacinas sem catálogo nem protocolo: nome livre, pendência fantasma por grafia | Importante | M | `immunization.protocols` nunca usada; dedupe por `vaccine_name` exato |
| Aplicar, editar e cancelar vacina fora do atendimento sem tela | Importante | S | `immunization.controller.ts:53-88` |
| Exames: laudo externo sem anexo, sem cancelar pedido, sem guia impressa, sem cadastro de laboratório ou exame próprio | Importante | M | `exam-result-sheet.tsx` sem `documentId`; `exams.controller.ts:70-74` |
| Prontuário em PDF incompleto (omite vitais, receitas, exames, vacinas, procedimentos) | Importante | M | `documents.service.ts:400-478` |
| Paciente sem operações de manutenção na tela: microchip, tutores, alertas, inativar | Importante | M | `patients.controller.ts:71-128` sem UI |
| Tutor: sem excluir na tela, edição não limpa campos, lista não acha por CPF, sem validação de CPF | Importante | S | `guardians.service.ts:186-223` (`COALESCE`), `69-70` |
| Receita controlada fora do modelo brasileiro (sem endereço e telefone do emitente, UF do CRMV, endereço do comprador, quantidade por extenso, fornecedor) | Importante | M | `pdf.service.ts:116-178` |
| Receita assinada sem PDF acessível quando o storage não está disponível | Importante | S | `documents.service.ts:227-262` insere `active` sem arquivo |
| Prescrever fora do atendimento, editar rascunho, catálogo de medicamentos | Importante | M | `prescriptions.controller.ts` sem PATCH |
| Recepção não gera carteira de vacinação nem declaração de comparecimento | Importante | S | template `receptionist` sem `document:generate` |
| Itens de cobrança nascem sem preço para vacina e exame, e sem tela | Importante | M | `encounters.service.ts:1041-1155` |
| Listas sem paginação e sem filtros de período | Importante | S | `pacientes/page.tsx:37-46` ignora `nextCursor` |

### 3.3 Produto de gestão

**Situação.** A fundação de gestão é boa: cadeia de autorização, entitlements
com validação de dependência, auditoria e log de acesso com tela, painel do
dia, busca global, notificações internas idempotentes, e o atendimento já gera
itens de cobrança. O que falta é quase todo o resto que o dono precisa para
gerir: nenhum relatório histórico, nenhuma exportação CSV, nenhuma lista
consolidada de cobranças, e configurações que cobrem só nome, cabeçalho de
receita, criar serviço e convidar. Dois bugs de contrato entre front e API
quebram a tela de Configurações hoje (módulos e papéis).

**Forte.** Autorização fail closed em cadeia única; entitlements com
`perm_version`; catálogo de módulos, permissões, papéis e planos com fonte
única em `packages/contracts` sincronizado no banco; auditoria append-only com
filtros e log de acesso a dado sensível; painel do dia com alertas clicáveis;
busca global por CPF via índice cego; notificações que não duplicam em 7 dias;
geração idempotente de itens de cobrança com pagador inferido; multiunidade
real com escopo por membership; tabelas de billing e inventory já sob RLS.

| Lacuna | Gravidade | Esforço | Evidência |
| --- | --- | --- | --- |
| Cadastro e edição de profissional com CRMV não existe; caixa de CRMV nunca é forçada no convite | Bloqueador | M | `catalog.controller.ts:98-111` só GET e POST; `members.service.ts:195-266` |
| Painel de Módulos lê campo errado e mostra interruptor para módulos inexistentes (Financeiro, Estoque, Relatórios, Internação, Cirurgia) | Importante | S | `configuracoes/page.tsx:16-21, 154-207` |
| Falta padrão de módulo indisponível no front; borda do faturamento sem tela | Importante | M | `navigation.ts:31-108`; `session.tsx:71-82` |
| Itens de cobrança sem preço em vacinas e exames, sem lista consolidada, quitação guardada por permissão de leitura | Importante | M | `encounters.service.ts:1004-1155`; `encounters.controller.ts:175-176` |
| Relatórios gerenciais não existem | Importante | M | `report:read` só declarada |
| Exportação CSV inexistente | Importante | S | única exportação é JSON LGPD por tutor |
| Horários de agenda, bloqueios e recursos sem endpoint nem tela | Importante | M | `scheduling.schedules` e `resources` nunca lidos |
| Painel de Papéis com contrato divergente: `id`, `requiresLicense` e `permissionCount` não vêm da API | Importante | S | `members-panel.tsx:16-23` vs `members.service.ts:290-303` |
| Catálogo de serviços: só criação na interface, sem editar preço, duração ou inativar | Importante | S | `catalog-panel.tsx:38-166`; PATCH existe |
| Planos sem efeito real; admin liga módulo fora do plano; sem endpoint de plataforma para atribuir plano | Importante | M | `permissions.ts:556-607` só ecoado |

### 3.4 Segurança e LGPD

**Situação.** A base é sólida e verificada. O que impede cobrar não é
arquitetura, é ausência de operação e de documentos: nenhuma rotina de backup,
nenhuma política de privacidade ou DPA, hash de integridade não verificável
depois. Faltam rate limiting, CSP, MFA, antivírus em upload, recuperação de
senha funcional e retenção por política. Dois furos de RBAC que o cliente vai
sentir: admin pode dar o papel `owner` a terceiros, e recepção baixa PDF de
prontuário e receita porque o download não olha sensibilidade.

**Forte.** Sessão opaca (32 bytes aleatórios, só o HMAC vai para o banco,
cookie httpOnly SameSite=Lax, expiração relativa e absoluta, revogação, rotação
na troca de organização); argon2id em parâmetros OWASP; guard fail closed;
negativa auditada; RLS habilitado e forçado com guarda de schema e testes de
isolamento; contexto de tenant sempre via `set_config` parametrizado; três
pools com papéis distintos; audit e access log append-only por trigger e
REVOKE; prontuário imutável por trigger; AES-256-GCM com prefixo de versão de
chave e índice cego HMAC; exportação e anonimização de tutor; upload em duas
etapas com magic bytes e download com `Content-Disposition: attachment`; CORS
por allowlist e checagem de Origin como CSRF; helmet; segredos só por ambiente
validado; logger com redação; contêiner sem root.

| Lacuna | Gravidade | Esforço | Evidência |
| --- | --- | --- | --- |
| Backup e restauração: nenhuma rotina | Bloqueador | M | compose só com volumes; nenhum `pg_dump` no repositório |
| Política de privacidade, termos, DPA e fluxo de aceite não existem | Bloqueador | M | `iam.terms_acceptances` sem uso; nenhuma página pública |
| Convite permite agir como outro usuário: token bruto devolvido na resposta em qualquer ambiente e aceite emitindo sessão para usuário já existente sem senha | Bloqueador | S | `members.controller.ts:30-34`; `identity.service.ts:504-528, 617-625` |
| Rate limiting inexistente: variáveis definidas, nada consome | Importante | S | `env.ts:60-61`; sem `@fastify/rate-limit` |
| Step-up sem contagem de tentativas: senha pode ser forçada com sessão roubada | Importante | S | `identity.service.ts:420-430` |
| Sessão: expiração deslizante nunca aplicada (sessão morre 12 h após login mesmo em uso); `COOKIE_SECURE` não forçado em prod | Importante | S | `session.service.ts:169-178` `touch()` nunca chamado |
| MFA/2FA não implementado (só colunas) | Importante | M | `0001_foundation.sql:259-260` |
| Escalada de privilégio: admin concede `owner` por convite ou edição | Importante | S | `members.service.ts:79-100, 155-158` |
| Download de documento ignora sensibilidade clínica | Importante | S | `documents.controller.ts:26-27, 62-63` só `document:read` |
| Hash de integridade não é verificável (timestamp de aplicação não persistido) e cobre pouco | Importante | M | `encounters.service.ts:922-947` |
| CSP inexistente; TLS/HSTS dependem do proxy | Importante | M | `main.ts:27-30` `contentSecurityPolicy: false`; `Caddyfile` sem CSP |
| Antivírus em upload ausente e EXIF não removido | Importante | M | `documents.service.ts:157-163` grava `skipped` |
| Upload por URL assinada sem limite de tamanho no storage; leitura integral em memória | Importante | S | `storage.service.ts:74-81, 96-107` |
| Auditoria: falha de login, logout, reset, aceite de convite não registrados; leitura de dado pessoal sem `access_log` | Importante | S | `identity.service.ts:62-71, 382-384, 449-473` |
| Direitos do titular: exportação parcial, sem fluxo de requisição, sem revogação de consentimento | Importante | M | `guardians.service.ts:265-352` |
| Retenção e expurgo por política não existem | Importante | M | `retention_until` nunca preenchida |
| Admin do tenant habilita módulos por conta própria (borda do faturamento) | Importante | S | `tenant.controller.ts:71-83` só `tenant:update` |
| Localização dos dados e subprocessadores sem documento | Importante | S | `data_region` sem efeito; `S3_REGION` default `us-east-1` |
| Prontuário frente à Res. CFMV 1321/2020: estrutura atende; guarda de 5 anos, sigilo e assinatura precisam de parecer | Importante | M | ver seção 7.4 |
| Receita de controlados: duas vias existem, faltam campos obrigatórios; Notificação de Receita não é gerável | Importante | S | `pdf.service.ts:116-176` |

### 3.5 Operação em produção

**Situação.** Melhor que a média de MVP: health e readiness nos três níveis,
log JSON com redação, requestId de ponta a ponta, filtro global de erro,
configuração validada, migração determinística com hash, sessão inteiramente
no banco, worker com outbox por `FOR UPDATE SKIP LOCKED`, desligamento
gracioso. O que impede cobrar é o entorno: sem backup, sem monitoramento, sem
alerta, sem rastreio de erro, sem runbook, e o readiness devolve 200 mesmo
degradado. Verificado ao vivo: com o banco pausado, `/ready` e o login travam
indefinidamente porque o pool não tem timeout, enquanto `/health` segue 200. A
pilha em contêiner roda hoje como `APP_ENV=dev` por herdar o `.env` de
desenvolvimento.

**Forte.** Health e readiness em API, worker e proxy; log com pino, `service`
por processo, redação de cookie, senha, token, e-mail, documento, telefone;
`requestId` gerado ou propagado e devolvido; contrato único de erro; erros de
banco mapeados sem vazar SQL; env validado com zod; migração em transação por
arquivo com hash; sem estado em processo; outbox com trava por linha e
contagem de tentativas; recuperação automática após indisponibilidade do banco
verificada ao vivo; imagens multi-stage com usuário sem privilégio.

| Lacuna | Gravidade | Esforço | Evidência |
| --- | --- | --- | --- |
| Backup e restauração não existem (banco, documentos, custódia das chaves de cifra) | Bloqueador | M | nenhum `pg_dump`, `rclone`, `mc mirror`; sem `LICENSE` no repositório e sem procedimento de custódia de segredos |
| Monitoramento, alerta e rastreio de erro não existem; `/ready` responde 200 degradado | Importante | M | `health.controller.ts:19-23` |
| Pool pg sem timeouts: banco pendurado trava requisições e `/ready` | Importante | S | `database.service.ts:39-47` |
| Relay da outbox trava em laço eterno com evento envenenado; retentativa duplica notificação | Importante | S | `outbox-relay.ts:34-74` sem SAVEPOINT por evento |
| Healthcheck do worker mede só liveness | Importante | S | `Dockerfile` aponta para `/health` |
| Worker aceita `DATABASE_URL` sem BYPASSRLS e passa a não fazer nada silenciosamente | Importante | S | `config.ts:36-37, 52` |
| Sem invariantes de produção (cookie sem Secure, segredos de exemplo, storage desligado, `APP_ENV=dev`) | Importante | S | `env.ts:22, 50-58`; compose herda `.env` |
| Storage decidido no boot; documento gerado registrado sem arquivo | Importante | S | `storage.service.ts:24-50`; `documents.service.ts:237-247` |
| Migração fora do compose: sem lock, sem `--status`, API não confere schema pendente | Importante | S | `migrate.ts:34-118` |
| Logging incompleto: sem access log na API, sem rotação, `X-Request-Id` sem sanitização | Importante | S | `main.ts:14-19` |
| Deploy sem pipeline, sem versionamento de imagem, sem rollback | Importante | M | sem `.github/`; imagens `latest` construídas no servidor |
| Sem limite de taxa nas rotas públicas: argon2 sem proteção por IP derruba instância pequena | Importante | S | `env.ts:60-61` |
| Runbook e procedimentos de suporte não existem | Importante | M | `docs/` sem operação |

### 3.6 Frontend e UX

**Situação.** Cerca de 11,5 mil linhas, 17 rotas, bem acima de protótipo:
cliente de API único com erros em português, React Query com cache e retry,
estados de carregamento, vazio e erro em todas as listas, shell mobile-first,
sheets que viram bottom sheet no celular, navegação derivada de permissões e
módulos. Os bloqueios para venda são poucos e baratos: as páginas de convite e
redefinição não existem, e toda data sem hora aparece um dia antes. Na
primeira semana o cliente vai esbarrar em: não remarca agendamento, agenda não
se atualiza sozinha e não tem semana, listas param em 50 ou 60 itens, PDF abre
por `window.open` após `await` (bloqueado no Safari e iPad), impressão do
prontuário sai com barra de navegação. Acessibilidade e formulários são o
maior débito estrutural: 119 de 121 campos com rótulo sem `htmlFor`, cinza
secundário abaixo do contraste AA, validação por toast, `react-hook-form`, `zod`
e dez pacotes Radix instalados sem uso.

**Forte.** Cliente de API único; React Query bem configurado; skeleton, erro
com "Tentar novamente" e vazio com ação em todas as listas; barra inferior com
os quatro destinos diários e sheet "Mais"; um único componente Sheet que é
bottom sheet no celular e diálogo no desktop; formulários montam só enquanto
abertos; navegação e botões derivam das mesmas chaves do backend; busca global
com `/` e `Ctrl+K`; leitura de código por leitor, digitação ou câmera; links de
WhatsApp com mensagem pronta; segurança clínica visível (faixa de alergia,
dose ao vivo, justificativa obrigatória, conflito com encaixe explícito);
editor de notas com salvamento automático; rótulos e formatação pt-BR
centralizados; formulários adaptados à espécie; build standalone com
cabeçalhos e usuário sem root; step-up transparente; deep links.

| Lacuna | Gravidade | Esforço | Evidência |
| --- | --- | --- | --- |
| Páginas de convite e redefinição de senha não existem; login sem "Esqueci minha senha" | Bloqueador | M | `members.controller.ts:30`; `identity.controller.ts:54` |
| Datas sem hora aparecem um dia antes no Brasil | Bloqueador | S | `format.ts:14-23` |
| Sem `error.tsx`, `global-error.tsx`, `not-found.tsx`: telas padrão do Next em inglês | Importante | S | `find apps/web/src/app -name error.tsx` vazio |
| Não existe remarcar ou editar agendamento | Importante | M | `agenda/page.tsx:173-257` |
| Agenda não se atualiza sozinha; sem visão semanal | Importante | L | `agenda/page.tsx:43-52` sem `refetchInterval` |
| Listas sem paginação; atendimentos sem filtro de data e busca | Importante | M | `pacientes/page.tsx:37-46` |
| PDF por `window.open` após `await`: bloqueado no Safari e iPad | Importante | S | `encounter-prescriptions.tsx:63-70` |
| Impressão do prontuário sai com navegação e sem cabeçalho da clínica | Importante | M | `globals.css:196-203` |
| Carteira de vacinação e atestados só na página Documentos, longe do fluxo | Importante | S | `generate-sheet.tsx` só em `documentos/page.tsx:127` |
| Rótulos não associados aos campos (119 de 121 sem `htmlFor`) | Importante | M | `field.tsx:51-59` |
| Cor de texto secundário abaixo do contraste AA (4,19:1) | Importante | S | `globals.css:18` `--ink-3: #6b807d` |
| Validação de formulário mínima e por toast; bibliotecas instaladas sem uso; sem máscaras | Importante | M | `react-hook-form`, `zod` sem importação |
| Fechar sheet por toque fora ou Esc descarta formulário sem confirmação | Importante | S | `sheet.tsx:38-51` |
| Sessão expirada ou falha de rede perde texto digitado; sem retorno à página de origem | Importante | M | `session.tsx:54-60`; `note-editor.tsx:64-95` |
| Sem `loading.tsx` por rota | Importante | S | nenhum `loading.tsx` |
| PWA só manifest: orientação travada em retrato, ícone só SVG, sem apple-touch-icon | Importante | S | `manifest.ts:9-13` |
| Cliente novo ao telefone exige três telas: seletor de paciente não cadastra na hora | Importante | M | `patient-picker.tsx:74-126` |
| Ações do paciente sem interface: alerta, óbito, vincular tutor, identificador | Importante | M | `patients.controller.ts:78-147` sem UI |
| Atendimento: sem registrar procedimento, cancelar, remover diagnóstico; modal de reabertura sem acessibilidade | Importante | M | `atendimentos/[id]/page.tsx:298-313, 390-444` |
| Receita e vacina sem catálogo; rascunho de receita não editável | Importante | M | `prescription-form.tsx:224-236` |
| Catálogo de serviços sem editar; sem cadastro de profissionais e unidades na tela | Importante | M | `catalog-panel.tsx:38-89` |
| Toggle do módulo Financeiro liga para o nada; atendimento sem resumo de cobrança | Importante | S | `configuracoes/page.tsx:184-207` |

### 3.7 Qualidade e testes

**Situação.** Base pequena mas bem mirada: 85 testes de unidade em
`packages/domain` (4,4 s) e 58 de integração contra PostgreSQL recriado do zero
(80 s), cobrindo isolamento entre tenants, papéis, entitlements e um fluxo
clínico de 21 passos. Lint com zero avisos e typecheck verdes. O que falta é o
entorno: nenhuma integração contínua, nenhum hook, nenhuma cobertura medida,
nenhum teste de interface ou navegador, e a guarda de RLS por tabela é script
manual. Dos 123 endpoints, cerca de 31 são exercitados; identidade (reset,
convite, bloqueio, step-up, CSRF), documentos e upload, PDF, exames, vacinas,
tutores e LGPD, membros e worker não têm nenhum teste.

**Forte.** Testes de unidade reais (dose com calopsita de 92 g e bovino de 512
kg, unidades, máquinas de estado, regras clínicas, GS1); integração sobe a
aplicação real pelo mesmo `createApp` de produção; teste de isolamento ataca o
banco direto com o papel da aplicação; 123 rotas todas com `@Authorize`,
`@Public` ou `@AuthenticatedOnly`; guarda de schema de RLS existe e passa;
`strict`, `noUncheckedIndexedAccess`, zero `any`, zero `eslint-disable`;
migrador com hash; sobreposição de agenda por constraint testada.

| Lacuna | Gravidade | Esforço | Evidência |
| --- | --- | --- | --- |
| Nenhuma integração contínua | Importante | M | sem `.github/`; hooks só `.sample` |
| Guarda de RLS por tabela fora da suíte automática | Importante | S | `verify-rls.ts` só manual |
| Sem processo de validação de release (tag, changelog, smoke) | Importante | S | `git tag` vazio |
| Cobertura de rotas nos testes de integração: cerca de 31 em 123 | Importante | L | extração das URLs em `apps/api/test` |
| Identidade e sessão sem teste (reset, convite, bloqueio, step-up, CSRF) | Importante | M | `identity.service.ts:55-71, 420-473, 475-560` |
| Documentos, upload e PDF nunca exercitados de verdade (S3 desligado nos testes) | Importante | M | `test-database.ts:88-89` |
| Hash de integridade sem teste de verificação | Importante | S | `clinical-flow.integration.test.ts:359` só checa presença |
| Borda do faturamento sem teste (itens de cobrança) | Importante | S | `encounters.service.ts:1006-1100` |
| Agenda: só a sobreposição é testada | Importante | M | `appointments.service.ts:182-395` |
| Atendimento: transições e regras de conteúdo via API sem teste negativo | Importante | M | `encounters.service.ts:298-1004` |
| Receita: controlados, licença, alergia, carência e cancelamento sem teste | Importante | M | `prescriptions.service.ts:119-436` |
| Exames e vacinas sem teste de integração | Importante | M | `exams.service.ts`, `immunization.service.ts` |
| Cadastro, LGPD, óbito e busca sem teste | Importante | M | `guardians.service.ts:265-352`; `patients.service.ts:631-716` |
| Configurações sem teste (membros, papéis, entitlements, unidades, catálogo) | Importante | S | `members.service.ts`, `tenant.service.ts` |
| Worker sem nenhum teste | Importante | S | `apps/worker` sem `test/` |
| Nenhum teste de interface, componente ou navegador | Importante | M | `apps/web` sem `*.test.*` |

### 3.8 Portabilidade de infraestrutura

**Situação.** A pilha é leve e sem estado fora do banco, compatível com
pgbouncer em modo transação e com contêineres que dormem. Os pontos que travam
hospedagem gratuita estão em quatro lugares: a migração 0001 cria papéis com
`CREATE ROLE` e um deles com `BYPASSRLS` (exige superusuário no PG15 ou papel
com `rolbypassrls` no PG16 e acima); o cliente S3 gera URL assinada com o host
interno e checksum CRC32 na query (quebra em R2, B2 e S3 real); o worker faz
polling a cada 2 segundos e mantém o banco acordado 24 h (incompatível com
autosuspend gratuito); e o cookie é SameSite=Lax fixo, então web e API precisam
estar na mesma origem ou no mesmo domínio registrável.

**Mapa serviço, o que precisa, modalidade.**

| Serviço | Precisa de | Pode rodar como |
| --- | --- | --- |
| Postgres | 15 ou superior (16 testado); pgcrypto, pg_trgm, btree_gist, citext (todas trusted); papel com CREATEROLE e capacidade de BYPASSRLS, ou adaptação por política; conexão direta para migrar; cerca de 24 conexões no pico; 30 MB por clínica a cada 4 meses | Gerenciado (Supabase, Neon em PG17) ou autogerido; autosuspend só se o worker deixar de pollar |
| API | Node 22 ou 24, 81 MB, boot menor que 1 s, `PORT`, alcance ao S3 e ao banco | Contêiner que dorme (sem estado); serverless só com adaptador; não roda em Workers ou Deno (argon2 nativo, Nest) |
| Migrador | `node dist/database/migrate.js`, `DATABASE_MIGRATION_URL` direta e `DATABASE_ROLE_PASSWORD` | Job único por deploy, release command, GitHub Actions |
| Worker | Node, 63 MB, papel BYPASSRLS, hoje sempre ligado (polling, nada externo o acorda) | Vira endpoint `POST /internal/jobs/tick` mais cron externo com esforço S/M |
| Web | Node standalone (server.js), `NEXT_PUBLIC_API_URL` fixado no build | Contêiner Node de 66 MB (pode dormir); plataforma Next; export estático inviável sem retrabalho |
| Proxy | Roteia `/api/*` e o resto; opcional | Qualquer proxy, rewrite do Next ou roteamento da plataforma |

| Lacuna | Gravidade | Esforço | Evidência |
| --- | --- | --- | --- |
| URL assinada do S3 com host interno e checksum CRC32: upload quebra fora do MinIO local; bucket precisa de CORS | Bloqueador | S | `storage.service.ts:31-36, 74-81`; `FILES_PUBLIC_HOST` sem uso |
| Papéis criados na migração exigem CREATEROLE; BYPASSRLS exige superusuário no PG15 ou papel com `rolbypassrls` no PG16 e acima | Importante | M | `0001_foundation.sql:500-512` |
| Migração exige conexão direta e as mesmas variáveis obrigatórias da API | Importante | S | `migrate.ts:51-53`; `env.ts:27, 50-58` |
| SMTP não implementado | Importante | M | `env.ts:65-66` |

---

## 4. O que falta para vender: lista consolidada

Consolidação das oito dimensões em três ondas. Cada item traz o esforço e o
arquivo principal. Detalhe de implementação está nas tabelas da seção 3.

### 4.1 Onda 1: sem isso não se cobra (bloqueadores)

| # | Item | Esforço | O que fazer |
| --- | --- | --- | --- |
| 1 | Permissões fantasmas no front | S | Trocar `encounter:finish` por `encounter:sign`, `note:amend` por `encounter:amend`, `record:read` por `record:read_sensitive`. Exportar `PermissionKey` do contrato e tipar `can()` para o compilador impedir chave inexistente. |
| 2 | Datas sem hora um dia antes | S | Em `format.ts`, tratar `AAAA-MM-DD` como data local; teste unitário com `TZ` fixo; remover os contornos `T12:00:00`. A API já devolve `AAAA-MM-DD` correto porque o contêiner roda em UTC; fixar `TZ=UTC` no Dockerfile e, por robustez, registrar um `types.setTypeParser` para `DATE` devolver string. |
| 3 | Convite não pode servir para agir como outro usuário | S | Em `members.controller.ts`, devolver `inviteUrl` só quando `APP_ENV` for `dev` ou `test` (em produção o link vai por e-mail); em `acceptInvitation`, se o e-mail já tem usuário com senha, exigir que ele esteja autenticado como esse usuário (ou informe a senha) antes de criar a membership e a sessão. Teste de integração cobrindo os dois casos. Até o e-mail existir, o admin copia o link, mas o aceite de usuário existente já fica protegido. |
| 4 | Provisionamento de organização | M | Extrair de `seed-data.ts` uma função `provisionTenant()` em `tenant/provisioning.service.ts` rodando em `db.withAdmin`: tenant, entitlements a partir de `plan_modules`, unidade padrão, convite de owner. Expor como CLI `tenant:create` e como `POST /platform/tenants` protegido por `isPlatformStaff` mais step-up. Fazer o seed usar a mesma função. |
| 5 | Envio de e-mail | M | `mailer.service.ts` com Resend por API HTTP (a Oracle bloqueia saída na porta 25 por padrão e vários PaaS também), modo dry-run quando sem chave e falha explícita em prod. Enviar em convite, redefinição de senha e provisionamento de owner. Templates em texto puro e HTML simples com o nome da clínica. SPF, DKIM e DMARC no domínio, de preferência num subdomínio de envio separado do domínio do app. |
| 6 | Páginas de convite, esqueci senha e redefinir senha | S | `apps/web/src/app/convite/[token]`, `esqueci-senha`, `redefinir-senha`; link na tela de login. No aceite, passar `facilityId` da unidade padrão para a sessão. Teste de integração invite, accept, login. |
| 7 | Papéis globais | S | Em `reference-data.ts`, upsert de cada template em `iam.roles` com `tenant_id NULL`, `is_system true`, `requires_license`, e sincronizar `role_permissions`. |
| 8 | Backup e restauração | M | Serviço `backup` no compose ou cron na VM: `pg_dump -Fc` diário, cifrado com `age`, enviado para R2 ou B2 (provedor diferente do primário); espelho do bucket de documentos; retenção 30 diários e 12 mensais; heartbeat no monitor ao terminar; `docs/RUNBOOK.md` com `pg_restore` e teste de restauração mensal; custódia de `COLUMN_ENCRYPTION_KEY`, `COLUMN_HASH_KEY` e `SESSION_SECRET` num cofre fora do servidor, separada do dump (sem a chave de coluna, CPF e CNPJ são irrecuperáveis). |
| 9 | Profissional com CRMV | M | `PATCH /professionals/:id`; `professional` em `PATCH /members/:id` (criar e vincular); `GET /roles` devolvendo `id`, `requiresLicense`, `permissionCount`; caixa de CRMV forçada quando o papel exige; aba Profissionais em Configurações. |
| 10 | Termos, privacidade e DPA | M | Textos versionados em `docs/legal` (redigidos com jurídico), rotas públicas `/termos`, `/privacidade`, `/dpa`, `GET /me/terms` e `POST /me/terms/accept`, gravação em `iam.terms_acceptances` com IP e versão, interstício de aceite quando a versão mudar. |
| 11 | S3 portátil | S | `requestChecksumCalculation: 'WHEN_REQUIRED'`; segundo `S3Client` com `S3_PUBLIC_ENDPOINT` só para presign; `HeadBucket` com retentativa preguiçosa em vez de desligar para sempre no boot; documentar CORS do bucket; `HeadObject` antes de ler para recusar objeto acima de `MAX_UPLOAD_BYTES`; aplicar `limits.storageGb` do plano (hoje `STORAGE_QUOTA_GB_DEFAULT` é declarada e nunca lida, e uma clínica pode esgotar o bucket de todas). |
| 12 | Readiness, timeouts e monitoramento | S | `/ready` devolve 503 quando degradado, checa banco com timeout de 2 s, storage e migrações pendentes; `Pool` com `connectionTimeoutMillis`, `statement_timeout`, `query_timeout` e `ssl` quando o banco for externo; `ALTER ROLE ... SET statement_timeout`; expor `/ready` do worker pelo proxy; UptimeRobot nos dois; Sentry no filtro de exceção. |
| 13 | Rate limit e step-up | S | `@fastify/rate-limit` global 60/min por IP e 10/min em `/auth/*`, store em memória (uma réplica; com duas réplicas o limite vale por réplica, o que é aceitável); em `stepUp`, reutilizar `locked_until` e `failed_login_attempts`. |

### 4.2 Onda 2: o cliente reclama na primeira semana (importantes)

Agrupados por tema. Estimativa da onda inteira: 5 a 7 semanas de um
desenvolvedor, podendo ser intercalada com o piloto.

**Agenda e recepção**

- Remarcar e editar agendamento (M): `EditAppointmentSheet` reaproveitando o
  formulário; na API, `update` revalida bloqueios, aceita `professionalId`
  nulo, grava `rescheduled` no histórico.
- Agenda com `refetchInterval` de 30 a 60 s e `refetchOnWindowFocus` (S), depois
  grade semanal por profissional (L).
- Cadastro de paciente e tutor a partir do seletor da agenda (M).
- Cancelar atendimento aberto por engano, com motivo (S), e permissão
  `encounter:cancel` para recepção nos status `arrived` e `triaged`.
- Horários de expediente por profissional e bloqueios (férias, almoço, feriado)
  com CRUD e marcação na agenda (M).
- Retornos: passar `originEncounterId` ao agendar e `followUpDueAt` no evento
  (S).
- Lista consolidada de cobranças pendentes do dia e resumo no atendimento
  (ver seção 5).

**Atendimento**

- Registrar procedimento e nota de procedimento ou anestesia (M).
- Assumir atendimento (outro veterinário finaliza) com auditoria (S).
- Reabrir com step-up tratado na tela (S).
- Óbito e eutanásia na ficha do paciente e no desfecho do finalizar (S).
- Prescrever fora do atendimento, editar rascunho, autocomplete de
  medicamentos a partir do histórico do tenant (M).
- Receita controlada com os campos do modelo brasileiro e bloqueio de listas
  que exigem talonário oficial (M). Ver seção 7.4.
- Prontuário em PDF completo a partir de `timeline.service.medicalRecord` (M).
- Carteira de vacinação e declaração acessíveis da ficha e do atendimento (S);
  `document:generate` para recepção com lista de modelos permitidos (S).
- PDF servido pela API quando o storage não estiver disponível, ou recusa
  explícita na assinatura (S).

**Cadastros**

- Paciente: vincular e desvincular tutor, identificador, alerta, inativar,
  excluir; `update` sem `COALESCE` cego (M).
- Tutor: inativar, busca por CPF na lista pelo índice cego, validação de dígito
  de CPF e CNPJ, máscaras (S).
- Vacinas: catálogo por espécie usando `immunization.protocols`, autocomplete,
  próxima dose sugerida, dedupe por protocolo (M); aplicar, editar e cancelar
  fora do atendimento (S).
- Exames: anexo do laudo, cancelar pedido, guia de solicitação em PDF, cadastro
  de laboratório e exame do tenant (M).
- Serviços: editar preço, duração, inativar (S). Profissionais e unidades
  editáveis na tela (M).
- Importação de tutores e pacientes por CSV com prévia e relatório de erros
  (M).

**Gestão**

- Painel de Módulos e de Papéis corrigidos e módulos não implementados com selo
  "Em breve" (S). Só 7 dos 12 módulos têm rota na API (core, scheduling,
  clinical, lab, immunization, documents, comms); o seed liga os 12 para o
  tenant demo, o que esconde o estado "desligado" em qualquer demonstração.
- Planos com efeito: `PlanLimitsService` para usuários, unidades e storage;
  módulo fora do plano só por staff da plataforma; trial com `trial_ends_at` e
  banner; suspensão de tenant bloqueando escrita (M). Hoje
  `session.service.ts:278` só recusa tenant `closed`; `suspended` e trial
  vencido seguem operando, então não existe mecanismo técnico para
  inadimplência.
- Ciclo de inadimplência e saída do cliente: aviso, `suspended` (somente
  leitura), `closed`; exportação por organização (CSV e JSON mais zip dos PDFs)
  para portabilidade contratual, porque hoje a única exportação é por tutor
  (`GET /guardians/:id/export`) e a saída de um cliente exigiria alguém no
  banco; prazo de guarda pós-cancelamento alinhado aos 5 anos do CFMV;
  tratamento dos backups que continuam contendo o tenant apagado (M).
- Ambiente de demonstração separado da produção: o seed recusa `APP_ENV=prod`
  de propósito, então a demonstração precisa de uma pilha de homologação (a
  segunda VM Micro serve) com reset diário e senha rotativa; hoje a senha
  `Chiron@2026` é fixa em `seed-data.ts:16` e publicada no README, e os
  e-mails `@chiron.dev` são previsíveis (S).
- Relatórios: produção por profissional, atendimentos e faltas por período,
  receita estimada por serviço, novos pacientes, recall (M).
- Exportação CSV nas listas com BOM e ponto e vírgula (S).
- Convites pendentes: listar, reenviar, revogar (S).
- Checklist de primeiro acesso no painel (M).
- Administração da plataforma: CLI de tenants primeiro, depois `/platform`
  com tela mínima (S depois M).

**Segurança**

- Sessão deslizante (`touch` com throttle) e `COOKIE_SECURE` obrigatório em
  prod (S).
- Bloquear concessão de `owner` por quem não é owner; transferência de
  titularidade explícita (S).
- Download de documento respeitando sensibilidade (S).
- Auditoria de login falho, logout, reset, aceite de convite; `access_log` em
  leitura de tutor e paciente; path sem query na negativa (S).
- Hash de integridade recalculável (payload persistido) com `GET
  /encounters/:id/integrity` (M).
- CSP em modo report-only e depois enforce; HSTS no proxy com domínio real (M).
- EXIF removido e PDF com JavaScript recusado (S); antivírus quando houver
  máquina para o clamd (M).
- Retenção: `docs/RETENCAO.md`, `retention_until` preenchido, job de candidatos
  a expurgo com aprovação (M).
- Direitos do titular: fluxo de requisição com prazo e desfecho, exportação
  ampliada e em PDF, revogação de consentimento (M).
- `docs/SUBPROCESSADORES.md` com provedor e região de cada componente (S).
- MFA TOTP opcional, obrigatório para owner e admin por configuração (M).

**Operação**

- CI no GitHub Actions: lint, typecheck, unidade, integração com Postgres em
  service container, guarda de RLS, build das três imagens com tag do sha (M).
  Vendorizar a fonte Inter (hoje `next/font/google` exige acesso a
  `fonts.googleapis.com` no build) para o build ser determinístico.
- Invariantes de produção no `env.ts` (S).
- Remover dependências mortas com vulnerabilidade: `pnpm audit --prod` acusa
  duas altas em `drizzle-orm` e em `js-yaml` via `@nestjs/swagger`, pacotes que
  nenhum arquivo importa; junto com `ioredis`, `@nestjs/config` e
  `date-fns-tz` (S). Alinhar `engines` para Node 24, que é o que `.nvmrc`,
  Dockerfiles e README fixam (S).
- SAVEPOINT por evento no relay e idempotência de notificação (S).
- Healthcheck do worker em `/ready`; worker falha rápido sem BYPASSRLS (S).
- Access log na API, sanitização de `X-Request-Id`, rotação de log no compose
  (S).
- Migração com advisory lock, `--status`, `--verify`, e API que recusa boot com
  schema pendente (S).
- `docs/RUNBOOK.md`: deploy, rollback, restauração, banco fora, storage fora,
  evento morto, rotação de segredo, destravar usuário, disco cheio (M).
- Tick do worker embutido na API acionado por cron externo, para hospedagem sem
  processo permanente (S/M).

**Frontend**

- `error.tsx`, `global-error.tsx`, `not-found.tsx`, `loading.tsx` (S).
- `openSignedUrl` síncrono ao clique (S).
- Impressão com `@media print` limpando navegação e cabeçalho da clínica (M).
- `Field` com `useId` e `aria-*` automáticos (M); `--ink-3` para `#5c706d` (S).
- `react-hook-form` com `zodResolver` usando os schemas de `@chiron/contracts`
  nos formulários grandes; máscaras de CPF, CNPJ, telefone e CEP; erros do
  servidor mapeados para o campo (M).
- Sheet com confirmação ao fechar formulário sujo (S).
- Rascunho de notas em `localStorage` até o servidor confirmar; `returnTo` no
  login; banner de sem conexão (M).
- Manifest sem `orientation` fixa, PNG 192 e 512, apple-touch-icon (S).
- Paginação por cursor em pacientes, tutores, atendimentos, documentos, exames
  (M).

**Testes**

- `schema-guard.integration.test.ts` chamando `checkSchemaGuard` e
  `checkFailClosed`; teste de isolamento iterando `rls_policy_registry` (S).
- Suítes de integração por módulo, na ordem: identity, documents (com MinIO no
  CI), scheduling, prescriptions, registry, lab, immunization, settings,
  charges, worker (L no total).
- Playwright com seis jornadas contra o seed, rodando no CI em `main` (M).
- `docs/RELEASE.md` com tag, changelog e smoke (S).

### 4.3 Onda 3: diferenciais

Foto do paciente; agendamento recorrente e lista de espera; internação com
evolução diária (XL); papel personalizado; estoque com lote e validade de
vacina (M para o recorte mínimo, XL completo); notificações internas com mais
produtores e preferências; auditoria com paginação e exportação; painel do dia
por unidade e visão mensal; rotação de chave de cifra; papel da aplicação sem
acesso a `iam.users` e `iam.sessions`; tempo de resposta uniforme no login;
`trustProxy` restrito; gestão de sessões por administrador; impersonação
somente leitura com grant do owner; assinatura eletrônica qualificada
(ICP-Brasil) em PDF; autocadastro com trial; tela de perfil do usuário; título
da aba por página; fuso da unidade nos formatadores; teclado e leitor de tela
em abas, seletores e chips; cobertura de código; hooks de commit e Prettier;
fixture de teste separada do seed; teste de carga de linha de base; imagens
Docker menores (API 855 MB pode ficar abaixo de 300 MB); dependências mortas
removidas (`ioredis`, `drizzle-orm`, `@nestjs/config`, `@nestjs/swagger`,
`date-fns-tz` na API; `react-hook-form`, `zod`, `cmdk`, dez pacotes Radix no
web, se não forem adotados); Redis fora do compose.

---

## 5. Faturamento em breve: como fica sem botão morto

Decisão de produto: o módulo Financeiro fica para o parceiro. O que precisa
existir agora é (a) a interface dizer isso sem mentir, (b) a borda que já
funciona ficar visível, (c) o contrato de dados que o parceiro vai consumir
ficar estável e testado.

### 5.1 Na interface

- No painel de Módulos, uma constante `IMPLEMENTED_MODULES` (core, scheduling,
  clinical, lab, immunization, documents, comms). Módulos fora dela
  (Financeiro, Estoque, Relatórios, Internação, Centro cirúrgico) aparecem com
  selo "Em breve" e sem interruptor. Texto curto: "Financeiro: cobrança, caixa
  e nota fiscal em parceria. Enquanto isso, o atendimento registra os itens a
  cobrar." Isso corrige também o bug de `moduleKey`.
- Hook `useModuleGate(module)` envolvendo as páginas de módulo: se o módulo
  estiver `disabled`, `EmptyState` explicativo com link para Configurações em
  vez do erro cru `MODULE_NOT_ENABLED`.
- O papel "Financeiro" some do seletor de convite até o módulo existir, ou vem
  com a descrição "recebe cobranças pendentes; módulo financeiro em breve".
- Nenhum item de menu para billing.

### 5.2 A borda que já funciona

- Card "Resumo para cobrança" no atendimento finalizado, somente leitura, com
  `GET /encounters/:id/charges`: serviço, procedimentos, vacinas, exames,
  quantidade, preço, total. Botão "Marcar como recebido fora do sistema" (`POST
  settle-externally`, com forma de pagamento em texto) e botão "Copiar resumo".
- Aba "Cobranças pendentes" na fila de atendimentos ou em Configurações,
  listando pendentes do dia por unidade: novo `GET /charges` com filtros de
  status, período, unidade e paciente, respeitando `facilityScope`.
- Permissão `charge:settle` separada de `charge:read` (hoje quitar é uma
  mutação guardada por permissão de leitura, e por isso passa com módulo
  suspenso).
- Preço padrão para vacina (serviço de categoria `vaccination`) e para exame do
  tenant (`default_price` no catálogo), para o item não nascer com total nulo.
- `PATCH /charges/:id` para quantidade, preço unitário e desconto enquanto
  `pending`, com auditoria.

### 5.3 O contrato para o parceiro

- `billing.charge_items` é o ponto de acoplamento: status `pending` (nasce no
  finalizar), `settled_externally` (recepção marcou), `invoiced` (parceiro
  emitiu, grava `invoice_line_id`), `cancelled`. Documentar em
  `docs/ARCHITECTURE.md` quem escreve e quem lê cada status.
- Teste de integração da geração: um item por serviço com preço do catálogo,
  itens de procedimento, vacina e exame com `source_table` e `source_id`,
  pagador igual ao tutor principal, reabrir e finalizar não duplica,
  `settle-externally` só muda `pending`, item de outro tenant não aparece.
- Prefixo reservado `/api/v1/webhooks/<parceiro>` com rota `@Public`, validação
  de assinatura HMAC com segredo próprio, idempotência por id de evento;
  processamento pela outbox que já existe.
- Entitlement `billing` controlado só pela plataforma (ou pelo evento de
  cobrança do parceiro), nunca pelo admin do tenant: hoje `PUT
  /entitlements/:moduleKey` exige apenas `tenant:update`.
- Dados fiscais da clínica capturados desde já: `PUT /tenant/legal-entity`
  (razão social, nome fantasia, CNPJ cifrado, regime tributário, endereço) e
  endereço e telefone da unidade editáveis na tela. É o que o parceiro vai
  pedir no primeiro dia.
- O que o parceiro vai receber do ponto de vista de infraestrutura: endpoint
  público de webhook sempre alcançável (contêiner que dorme atrasa entrega),
  egress HTTPS liberado, segredo do parceiro em variável de ambiente, retry
  pela outbox. Nada disso exige mudar hospedagem.

---

## 6. O que falta fora do código: empresa, jurídico e comercial

Nada disto aparece no repositório e tudo é pré-requisito para a primeira
cobrança.

### 6.1 Empresa

- MEI é vedado para desenvolvimento e licenciamento de software (CNAE 6203-1/00
  e 6201-5/01 são atividade intelectual). É preciso abrir ME (ou EPP) e optar
  pelo Simples Nacional. Serviço tributável pelo ISS no subitem 1.05 da LC
  116/2003, com 1.03 e 1.07 como acessórios; alíquota de ISS de 2% a 5% no
  município da sede.
- Anexo III (6% inicial) quando o Fator R (folha incluindo pró-labore sobre a
  receita bruta dos 12 meses) for igual ou maior que 28%; sem folha, Anexo V
  (15,5%). Definir o pró-labore com o contador antes da primeira nota.
- NFS-e pelo emissor nacional gratuito, obrigatória para ME e EPP do Simples a
  partir de setembro ou novembro de 2026 conforme a fonte (confirmar com o
  contador), desde a primeira mensalidade. Emissão via API integrada à SEFIN
  nacional pode ser automatizada depois.
- Contabilidade online: ordem de grandeza R$ 100 a R$ 200 por mês (valor de
  mercado, não verificado). É o maior custo fixo real do estágio zero, acima
  da infraestrutura.

### 6.2 Jurídico

- Contrato de assinatura com: SLA (mesmo modesto), guarda e exportação dos
  dados por 5 anos após o cancelamento ou devolução ao cliente, portabilidade,
  responsabilidade sobre backups, e cláusula explícita de que documentos
  impressos sem certificado não são assinados digitalmente.
- DPA (contrato de operador) definindo a clínica como controladora e o CHIRON
  como operador (LGPD arts. 37 a 39), com finalidade, retenção, eliminação ao
  fim do contrato, lista de subprocessadores (hospedagem, storage, e-mail),
  prazo de comunicação de incidente e procedimento de acesso da equipe do
  CHIRON aos dados (hoje só direto no banco, sem trilha na aplicação).
- Política de privacidade da plataforma para os usuários (contas de staff, dos
  quais o CHIRON é controlador) e termos de uso.
- Nomeação de encarregado (art. 41) com canal público; registro simplificado de
  operações; plano de resposta a incidente com prazos de 3 e 6 dias úteis;
  política de retenção alinhada aos 5 anos do CFMV.
- Se qualquer componente ficar fora do Brasil (R2, B2, Resend, Sentry, GitHub),
  cláusulas-padrão da ANPD (Res. 19/2024, obrigatória desde 23/08/2025) no DPA.
  A recomendação da seção 8 mantém banco, aplicação e arquivos primários em São
  Paulo, e deixa fora do país apenas backup cifrado, e-mail transacional e
  telemetria sem dado pessoal.
- Parecer sobre os itens regulatórios da seção 7.4 antes de qualquer alegação
  de conformidade no material de venda.

### 6.3 Comercial e suporte

- Cobrança recorrente: Asaas (sem mensalidade; Pix e boleto R$ 1,99; cartão R$
  0,49 mais 2,99%; API de assinaturas e webhooks). Alternativas: Stripe
  Billing (3,99% mais R$ 0,39 mais 0,7%, Pix só por convite) ou Pix estático da
  conta PJ sem automação. Para mensalidade de R$ 99, o custo por cobrança fica
  entre 2% e 3,5%.
- Canal de suporte: WhatsApp e e-mail do fornecedor visíveis no menu do usuário
  (hoje não há), com horário declarado. Status page do UptimeRobot pública.
- Materiais: roteiro de demonstração sobre o seed (que já tem 3 meses de
  histórico), página com preços, política de reembolso e cancelamento (com
  exportação e exclusão de dados), roadmap público curto e honesto ("Financeiro
  em breve").
- Migração de dados: modelo de planilha e importador (seção 4.2), mais
  procedimento assistido para os primeiros clientes.
- Treinamento: um vídeo curto por fluxo (cadastrar, agendar, atender, receitar,
  vacinar) e o checklist de primeiro acesso dentro do produto.
- Piloto: uma ou duas clínicas de graça por 60 dias em troca de feedback
  semanal, antes de cobrar de qualquer uma, com contrato de piloto e DPA
  assinados mesmo sem cobrança.
- Página pública: hoje a raiz do domínio é o painel autenticado e não existe
  nenhuma rota pública além de `/entrar`; o prospect que digitar o endereço cai
  no login. Uma landing estática (o que é, para quem, preços, termos,
  privacidade, contato, status) pode ser servida pelo mesmo Caddy.
- Caixas postais: `contato@`, `suporte@`, `encarregado@` e `seguranca@` no
  domínio (Cloudflare Email Routing é gratuito), mais um `security.txt`.

### 6.4 O que comprador, investidor e operador vão perguntar

Lista para preparar antes que a pergunta chegue. Nada disto está no código nem
nos documentos atuais.

**Comprador (dono da clínica ou advogado)**

- Contrato: objeto, prazo, reajuste anual (índice), aviso prévio, multa, foro,
  teto de responsabilidade, e cláusula deixando claro que dose por peso,
  checagem de alergia e faixas de referência (que nascem "não validadas" por
  decisão da ADR 0010) são apoio à decisão e a responsabilidade clínica é do
  veterinário.
- SLA em números: com um servidor só e RPO de 24 h e RTO de 1 a 2 h, o máximo
  honesto é 99,5% sem crédito; horário de suporte (clínica atende sábado),
  tempo de primeira resposta por severidade, janela de manutenção, status page
  pública.
- Migração: de quais sistemas (SimplesVet, VetSoft, Vetus, Vetwork, planilha,
  papel), quais entidades além de tutor e paciente (vacinas com próxima dose,
  histórico como texto importado com origem, anexos), CPF duplicado ou ausente,
  prévia e relatório de rejeições, quem executa e se é cobrado. Como o CFMV
  exige 5 anos de guarda, quem migra precisa trazer o histórico ou manter
  acesso ao sistema antigo.
- Implantação e treinamento: checklist de go-live (cabeçalho de receita,
  serviços e preços, profissionais com CRMV, unidade, validação das faixas de
  referência, convite da equipe), material por papel, quem faz a carga inicial.
- Cancelamento e reembolso: garantia de 7 dias (o CDC pode alcançar clínica
  pessoa jurídica pela teoria finalista mitigada; parecer), cancelamento no fim
  do ciclo, reembolso de anual, exportação e exclusão de dados na saída.
- Segurança para clínica maior ou rede: questionário com MFA (não existe), SSO,
  teste de intrusão externo, ciclo de atualização (Dependabot ou Renovate),
  retenção de logs de acesso por 6 meses (Marco Civil, art. 15), TLS entre API
  e banco quando o banco for externo, quem da equipe do fornecedor acessa os
  dados e como fica registrado.
- Roadmap: página "em breve" honesta, versão visível no app (hoje tudo é
  0.1.0 e a interface não mostra versão), canal de sugestões; e respostas
  prontas para "tem app do tutor?", "integra com laboratório?", "guarda
  raio-x?", que toda clínica pergunta.

**Investidor ou sócio**

- Tamanho de mercado (quantas clínicas, quantas usam software, quanto pagam),
  canal de aquisição e custo, churn esperado, ciclo de venda.
- Propriedade intelectual: não há `LICENSE` nem campo `license` nos
  `package.json`, e os 23 commits são de um único autor identificado como
  "unknown"; sem contrato de cessão não há evidência de titularidade. Registrar
  a marca no INPI (nome comum, risco de colisão nas classes 9 e 42) e conferir
  o domínio antes de investir em identidade visual.
- Time e concentração de risco: uma pessoa. Escrow de código e credenciais para
  um segundo humano; o que acontece se o desenvolvedor ficar indisponível.
- Diferenciação defensável: RLS e auditoria não convencem a dona da clínica;
  multiespécie de verdade, prontuário imutável e LGPD levada a sério convencem
  quem atende silvestres e grandes animais e quem já perdeu histórico.
- Dependência do parceiro de faturamento e plano B se a Oracle encerrar a
  conta.

**Operador (quem vai manter no ar)**

- Custódia e rotação de segredos: perder `COLUMN_ENCRYPTION_KEY` torna CPF e
  CNPJ irrecuperáveis; a chave precisa de cópia separada do banco.
- Quem tem acesso a produção; procedimento de acesso ao dado do cliente pelo
  suporte (impersonação não existe; hoje é direto no banco, sem trilha).
- Gestão de vulnerabilidades e cadência de atualização; matriz de navegadores e
  dispositivos suportados (iPad, tablet Android, Safari); teste de restauração
  agendado; renovação de domínio e do cartão na Oracle.
- Seguro de responsabilidade civil ou cyber, e quem responde por prontuário
  perdido ou dose calculada errada.
- Regime simplificado da ANPD para agente de pequeno porte (Res. 2/2022):
  decidir se o CHIRON se enquadra (encarregado facultativo, registro
  simplificado) e registrar a decisão no plano jurídico.
- Analytics de produto e retenção: nenhuma telemetria de uso existe (nem para
  saber que uma clínica parou de usar); se for adotada, sem dado pessoal e sem
  CDN externa, por causa da CSP e da LGPD.
- Documentação de API: nenhum OpenAPI é gerado (`@nestjs/swagger` está
  declarado e não é usado); não há webhooks de saída nem chaves de API, então o
  parceiro de faturamento e qualquer laboratório ou app de tutor não têm por
  onde entrar. O parceiro também precisa constar no DPA como suboperador.

---

## 7. Mercado, preço e regulação

### 7.1 Preços praticados em agosto de 2026

| Degrau | Exemplos verificados | Faixa mensal |
| --- | --- | --- |
| Prontuário de entrada gratuito ou barato | Vet Smart R$ 0 (1 usuário, 150 animais), R$ 39,90 (5 usuários), R$ 89,90 PRO; VetSoft Gratuito (1 usuário, 30 animais); VetSuite Free (3 usuários); PetFlow grátis | R$ 0 a R$ 90 |
| Clínica pequena com gestão simples | VetBase R$ 99 (1 usuário); Nuvem Vet R$ 109 (usuários ilimitados); Vetwork Volante R$ 119,90 (1 usuário, só clínico); VetSoft Inicial R$ 140; Vetwork Inicial R$ 179,90 (3 usuários) | R$ 99 a R$ 180 |
| Clínica com 3 a 10 usuários e ERP | Vetus R$ 229,89 a R$ 287,39 (2 usuários); VetSoft Trio R$ 261 a Clínica R$ 401; Vetwork Profissional R$ 259,90; SimplesVet R$ 359 (3) a R$ 440 (10) | R$ 220 a R$ 440 |
| Hospital e rede | SimplesVet R$ 549 (15) e R$ 979 (ilimitado); VetSoft Ilimitado R$ 860 | R$ 549 e acima |

Módulos vendidos à parte: fiscal R$ 60 a R$ 153; internação R$ 49 a R$ 136;
receita digital R$ 20 por usuário; WhatsApp R$ 0,50 a R$ 0,55 por mensagem. O
padrão é cobrar por clínica com faixa de usuários, não por usuário isolado.

### 7.2 O que o mercado trata como obrigatório e o CHIRON não tem

Todos aparecem no plano de entrada de ao menos três concorrentes: financeiro
com contas a pagar e receber, caixa, PDV e comissões; estoque com entrada por
XML e validade; emissão fiscal NFS-e e NFC-e ao menos como add-on; lembretes de
vacina e consulta por WhatsApp, e-mail e SMS, e envio de receita e documentos
por WhatsApp ou link; portal ou app do tutor; receita digital assinada com
certificado ICP-Brasil (Vet Smart entrega até no gratuito); relatórios
gerenciais; integração com maquininha; multiunidade em tela; agenda online.
Prontuário, agenda, vacinas, exames e documentos, que o CHIRON tem, são
commodity presentes em todos, inclusive nos gratuitos.

O que o CHIRON tem e a maioria não anuncia: isolamento multi-tenant provado,
prontuário imutável com adendo, dose por peso com alergia e carência para
produção, cadastro real de 18 espécies com faixas por espécie, LGPD com cifra e
índice cego, auditoria com log de acesso. Isso vende para clínica que atende
silvestres e grandes animais, para quem já sofreu com sistema que perde
histórico, e para quem tem advogado olhando LGPD. Não vende para pet shop.

### 7.3 Posicionamento e preço sugerido

Com o escopo atual, o CHIRON só é comparável ao degrau 1 e ao Vetwork Volante.
Esta é a tabela única de preço usada em todo o documento (o resumo executivo
cita a faixa de mercado; aqui está o ponto escolhido dentro dela):

| Plano no código | Nome comercial | Preço | Limites | Quando |
| --- | --- | --- | --- | --- |
| `solo` | Autônomo | R$ 0 | 1 usuário, 1 unidade, até 100 pacientes ativos, sem lembretes | Só por provisionamento assistido (veterinário autônomo indicado, piloto), enquanto não houver autocadastro. É ferramenta de venda, não canal: cada conta gratuita custa um comando de CLI. Vira canal quando o autocadastro com trial existir (Onda 3), e aí o autocadastro passa de diferencial a obrigatório |
| `solo` pago | Essencial | R$ 99 por mês (R$ 79 no anual) | Até 3 usuários, 1 unidade, pacientes ilimitados | Após a Onda 1 |
| `clinic` | Clínica | R$ 179 por mês (R$ 149 no anual) | Até 10 usuários, até 3 unidades, relatórios, exportação | Após a Onda 2 |
| `hospital` | Hospital | R$ 299 e acima | Internação, cirurgia, financeiro | Só quando os módulos existirem |

Os limites no código hoje são `solo` 2 usuários e 1 unidade, `clinic` 15
usuários e 3 unidades (e o plano `clinic` inclui inventory, reports e billing,
que não existem); ajustar `PLANS` em `packages/contracts` para refletir a
tabela comercial e tirar dos planos os módulos sem rota até existirem.

Detalhes operacionais a decidir junto: usuário adicional (sugestão R$ 25 por
mês), 14 dias de teste no Essencial, pró-rata na troca de plano, cobrança em
qual CNPJ, forma de pagamento (Pix e boleto pelo Asaas, cartão recorrente), e o
que acontece com o preço quando o Financeiro do parceiro chegar (add-on
separado, referência de mercado R$ 60 a R$ 150).

Abaixo de R$ 79 compete com gratuitos; acima de R$ 200 sem financeiro perde
para Vetus e VetSoft. Módulos futuros como add-on seguem a referência do
mercado: WhatsApp por mensagem repassando o custo da Meta (cerca de R$ 0,04 por
lembrete de utilidade) com margem, internação e fiscal entre R$ 49 e R$ 97.
Cobrar por consumo (armazenamento, e-mails) como o VetSuite combina bem com a
pilha de custo variável baixo.

Para os planos terem efeito é preciso a Onda 2 de gestão: limites aplicados,
módulo fora do plano só por staff, trial com data.

### 7.4 Regulação: o que validar com jurídico antes da primeira venda

Verificação técnica no código versus item que exige parecer:

1. **Prontuário eletrônico (Res. CFMV 1321/2020).** O código já entrega o
   conteúdo mínimo do art. 9 (data, hora, local, profissional, relato do
   responsável, estado geral, anamnese, exame clínico, diagnóstico,
   procedimentos com autor, imunizações), imutabilidade após assinatura,
   adendo, trilha de acesso e exportação em PDF. Guarda de 5 anos após o último
   atendimento é texto expresso do art. 9 §3: hoje o sistema simplesmente nunca
   apaga, mas não há política de retenção declarada e a exclusão em cascata do
   tenant apagaria tudo. Parecer necessário: se a assinatura eletrônica simples
   (login e clique) mais hash atende o art. 3 §2 sem certificado ICP-Brasil, e
   se administrador não veterinário pode ler o prontuário integral (sigilo).
2. **Res. CFMV 1653/2025.** Usar "responsável pelo animal" nos documentos
   gerados (o CHIRON usa "tutor"); termo de retirada sem alta com testemunhas;
   evolução diária com nome e CRMV; cópia do prontuário em 5 dias úteis com
   registro do pedido; prontuário e carteira em duas vias. Itens de texto e
   modelo, esforço S a M.
3. **Receita simples e telemedicina (Res. CFMV 1465/2022).** Receita impressa e
   assinada à mão é válida. Não chamar de "receita digital" nem enviar PDF como
   receita eletrônica válida sem assinatura eletrônica avançada ou qualificada.
   Antimicrobianos exigem ao menos avançada.
4. **Controlados (Portaria SVS/MS 344/1998, RDC Anvisa 1.000/2025).** Receita
   de Controle Especial em duas vias existe, mas faltam campos: endereço e
   telefone do emitente de forma estruturada, UF do CRMV, endereço do tutor,
   quantidade por extenso, blocos de comprador e fornecedor, CPF do
   responsável conforme os novos modelos. Notificação de Receita (listas A e B)
   é talonário oficial numerado: o sistema não pode gerar, só registrar o
   número. Receita eletrônica de controlado exigirá assinatura qualificada e
   integração ao SNCR (funcionalidade prevista para 30/09/2026; credenciamento
   não verificado). Enquanto isso, imprimir e assinar.
5. **Portaria MAPA 837/2025.** Notificação de Receita Veterinária é numerada em
   sistema do MAPA; orientar o veterinário e registrar o número no prontuário.
6. **LGPD.** Ver seção 6.2. Base legal do prontuário é obrigação regulatória, o
   que limita pedidos de eliminação; a anonimização de tutor já preserva o
   registro clínico do animal, o que é o desenho certo.
7. **Alegações no marketing.** Não afirmar "conforme CFMV" ou "assinatura
   digital" antes do parecer; afirmar o que é verdade: prontuário que não pode
   ser reescrito, trilha de acesso, dados cifrados, backup diário, dados no
   Brasil.

---

## 8. Como colocar no ar sem custo

### 8.1 Princípios

- Custo zero de verdade, com uso comercial permitido pelos termos do provedor
  (o plano Hobby da Vercel, por exemplo, proíbe uso comercial e fica fora).
- Processos sempre ligados, porque o worker precisa rodar e a API não pode
  levar um minuto para acordar no meio do expediente da recepção.
- Dados primários no Brasil (São Paulo) por latência e por LGPD; fora do país
  só backup cifrado, e-mail e telemetria sem dado pessoal, sob cláusula.
- Backup em provedor diferente do primário: se a conta do provedor primário
  cair, o backup continua existindo.
- O menor número possível de mudanças no código: a pilha em contêiner que
  existe hoje já sobe tudo com um comando.
- Cartão de crédito é aceitável quando o provedor não cobra dentro do
  gratuito; a única despesa fixa é o domínio.

### 8.2 Pilha recomendada (plano A)

| Componente | Provedor e plano | Limite gratuito | Onde | Observação |
| --- | --- | --- | --- | --- |
| VM para API, web, worker, Postgres, Caddy | Oracle Cloud Always Free, home region `sa-saopaulo-1` (ou `sa-vinhedo-1`) | Ampere A1: total de 2 OCPU e 12 GB de RAM (pode ser 1 VM 2/12 ou 2 VMs 1/6); mais 2 VMs AMD E2.1.Micro (1/8 OCPU com burst, 1 GB cada); 200 GB de disco total; 10 TB de saída por mês | São Paulo | Cartão obrigatório no cadastro, sem cobrança. A1 costuma estar sem capacidade em São Paulo; começar pelas Micro e migrar quando conseguir criar a A1. Fazer upgrade para Pay As You Go com alerta de orçamento de US$ 1 para sair da regra de reclamação por ociosidade; continua US$ 0 dentro do Always Free |
| Arquivos (documentos, PDFs) | OCI Object Storage, API compatível com S3 com URL assinada | 20 GB Always Free | São Paulo, mesma conta | Mantém arquivos de saúde no Brasil. Exige a correção do S3 (seção 4.1 item 10) e CORS no bucket. Alternativa: Cloudflare R2, 10 GB, sem custo de saída, fora do Brasil |
| Backup do banco e espelho dos arquivos | Cloudflare R2 (10 GB, pede cartão ou PayPal para ativar, sem cobrança) ou Backblaze B2 (10 GB, sem cartão) | 10 GB cada | Fora do Brasil, cifrado com `age` | Provedor diferente do primário de propósito. `pg_dump -Fc` diário pelo cron da VM ou pelo GitHub Actions; retenção 30 diários e 12 mensais |
| E-mail transacional | Resend Free | 3.000 por mês, 100 por dia, 1 domínio | EUA | API HTTP (não depende de porta SMTP); SPF, DKIM e DMARC no domínio. Alternativa: Brevo, 300 por dia, com logo do provedor |
| WhatsApp | Meta Cloud API direto | Respostas dentro da janela de 24 h gratuitas e ilimitadas; template de utilidade fora da janela cerca de US$ 0,0068 (cerca de R$ 0,04) | Global | Sem mensalidade. Não usar Z-API nem Evolution em modo QR (banimentos em 2026 e violação de termos). Etapa 1 pode ser o botão manual `wa.me` que já existe |
| DNS, proxy, TLS de borda | Cloudflare Free | Sem limite de consultas, proxy, DDoS, Universal SSL | Pontos de presença no Brasil | Modo Full strict com Let's Encrypt no Caddy da VM |
| Domínio | Registro.br `.com.br` | R$ 40 por ano | Brasil | Única despesa fixa: R$ 3,33 por mês |
| Certificado TLS | Let's Encrypt via Caddy | Gratuito, renovação automática | | Trocar `:8080` pelo domínio no `Caddyfile` e remover `auto_https off` |
| Uptime e status page | UptimeRobot Free | 50 monitores a cada 5 min, 1 status page | | Monitorar `/api/v1/ready`, `/healthz/worker` e a raiz do web; heartbeat do backup |
| Erros | Sentry Developer | 5.000 erros por mês, 1 usuário | EUA ou UE | Capturar no filtro de exceção da API e no `error.tsx` do web, sem dado pessoal |
| Logs, métricas, traces | Grafana Cloud Free | 50 GB de logs, 50 GB de traces, 10 mil séries, 14 dias, 3 usuários | | Via OpenTelemetry quando houver tempo; no início os logs do Docker com rotação bastam |
| CI e cron | GitHub Actions | 2.000 minutos por mês em repositório privado | EUA | Lint, typecheck, testes, build das imagens; workflow de backup opcional |
| Cobrança das mensalidades | Asaas | Sem mensalidade; por transação | Brasil | Ver seção 6.3 |

Custo fixo total: R$ 40 por ano.

### 8.3 Passo a passo do plano A

1. **Conta e VM.** Criar a conta Oracle com home region São Paulo (não dá para
   mudar depois). Tentar criar a VM A1.Flex com 2 OCPU e 12 GB; se vier "Out of
   host capacity", criar as duas E2.1.Micro e agendar um script de retentativa
   para a A1. Ubuntu, disco de boot de 50 GB. Abrir 80 e 443 na security list
   e no firewall da VM. Fazer o upgrade para Pay As You Go e criar um alerta de
   orçamento de US$ 1 (isso não gera cobrança dentro do Always Free e evita a
   reclamação por ociosidade).
2. **Docker e repositório.** Instalar Docker e Compose, clonar o repositório
   (ou puxar as imagens do GHCR quando o CI existir). Nas duas Micro: API,
   worker e Postgres numa; web e Caddy na outra, ligadas pela rede privada da
   VCN.
3. **Segredos.** Gerar `SESSION_SECRET`, `COLUMN_ENCRYPTION_KEY`,
   `COLUMN_HASH_KEY`, `DATABASE_ROLE_PASSWORD`, `POSTGRES_PASSWORD` novos e
   guardar num gerenciador de senhas fora do servidor. `APP_ENV=prod`,
   `NODE_ENV=production`, `COOKIE_SECURE=true`, `PUBLIC_APP_URL=https://app.<dominio>.com.br`.
   Criar `.env.prod` a partir de um `.env.prod.example` novo (hoje o mesmo
   `.env` serve dev e pilha, e é por isso que a pilha roda como dev).
4. **Storage.** Criar o bucket privado no OCI Object Storage, chave de acesso
   S3 (Customer Secret Key), regra de CORS para `PUT` a partir da origem do
   web, `S3_ENDPOINT` do namespace, `S3_FORCE_PATH_STYLE=true`. Remover o MinIO
   do compose de produção (economiza 146 MB de RAM). Antes disso, aplicar a
   correção do S3 da seção 4.1.
5. **Domínio e TLS.** Registrar o `.com.br`, apontar os nameservers para a
   Cloudflare, criar `app` (proxied, Full strict) apontando para o IP da VM do
   Caddy. No `Caddyfile`, trocar `:8080` por `app.<dominio>.com.br` e remover
   `auto_https off`. Adicionar `Strict-Transport-Security`.
6. **Subir.** `docker compose up -d`; a migração roda antes da API. Rodar o
   CLI `tenant:create` para a primeira clínica (depois da Onda 1) e enviar o
   convite de owner.
7. **E-mail.** Conta Resend, domínio verificado com SPF, DKIM e DMARC (de
   preferência um subdomínio de envio, como `mail.<dominio>.com.br`, para não
   queimar a reputação do domínio do app), `EMAIL_PROVIDER=resend`,
   `EMAIL_API_KEY`, `EMAIL_FROM=CHIRON <nao-responda@mail.<dominio>.com.br>`.
   Usar a API HTTP: a Oracle bloqueia saída na porta 25 por padrão. Caixas de
   recebimento (`contato@`, `suporte@`, `encarregado@`, `seguranca@`) via
   Cloudflare Email Routing, gratuito.
8. **Backup.** Serviço `backup` no compose ou cron na VM: `pg_dump -Fc`
   diário, `age -r <chave pública>`, `rclone copy` para R2 ou B2; `rclone sync`
   do bucket de documentos para o mesmo destino; retenção por lifecycle rule;
   heartbeat no UptimeRobot ao terminar. Testar `pg_restore` num Postgres
   temporário na primeira semana e depois todo mês.
9. **Monitoramento.** UptimeRobot em `/api/v1/ready` (depois de fazer o
   `/ready` responder 503 quando degradado), em `/healthz/worker` e na raiz do
   web; alerta por e-mail e Telegram. Sentry na API e no web. Rotação de log
   no compose (`max-size 10m`, `max-file 5`).
10. **CI e deploy.** GitHub Actions publicando as três imagens no GHCR com a
    tag do sha; no servidor, `docker compose pull && docker compose up -d`;
    rollback é `IMAGE_TAG=<sha anterior> docker compose up -d`. Deploy fora do
    horário da clínica.
11. **Runbook.** `docs/RUNBOOK.md` com os comandos de deploy, rollback,
    restauração, banco fora, storage fora, evento morto, rotação de segredo,
    destravar usuário, disco cheio.

Ajustes de código exigidos pelo plano A: correção do S3 (S), invariantes de
produção no `env.ts` (S), `/ready` com 503 (S), timeouts no pool (S), rotação de
log e `mem_limit` no compose (S), Redis fora do compose (S). O restante do
código roda como está, inclusive as quatro migrações de papéis, porque o
Postgres é seu e você é superusuário.

### 8.4 Plano B: gerenciado, sem VM

Para quando a Oracle recusar o cadastro, ficar semanas sem capacidade ou
encerrar a conta.

| Componente | Provedor | Limite | Onde | Ajuste no código |
| --- | --- | --- | --- | --- |
| Postgres | Supabase Free, projeto em `sa-east-1`, Postgres 17 | 500 MB, 60 conexões diretas e 200 no pooler, sem cartão, sem backup, pausa após 7 dias sem atividade | São Paulo | Rodar a migração como o usuário `postgres` (tem CREATEROLE e BYPASSRLS, o que no PG16 e acima permite criar `chiron_admin` com BYPASSRLS; validar num projeto de teste antes). Conectar API e worker pelo pooler em modo sessão (a conexão direta é só IPv6). O worker mantém o projeto acordado. `pg_dump` diário obrigatório porque não há backup |
| API e web | Google Cloud Run em `southamerica-east1` (Tier 2, consome o gratuito cerca de 40% mais rápido) ou Azure Container Apps em Brazil South | 2 milhões de requisições, 180 mil vCPU-s, 360 mil GiB-s por mês; escala a zero; cold start de 1 a 3 s | São Paulo | Cartão obrigatório; alerta de orçamento. Web e API sob o mesmo domínio via rewrite ou subdomínios `app.` e `api.` do mesmo domínio (o cookie exige mesmo site) |
| Worker | Cloud Run Job disparado pelo Cloud Scheduler (3 jobs gratuitos) ou Container Apps Job | Dentro do mesmo grant | São Paulo | Implementar `POST /internal/jobs/tick` protegido por segredo, que chama `relayOnce` e os jobs vencidos com registro em `platform.job_runs`; ou o Job roda `node dist/main.js` em modo uma passada |
| Arquivos | Cloudflare R2 | 10 GB | Fora do Brasil | Correção do S3; cláusula de transferência no DPA |
| O resto | Igual ao plano A | | | |

Sem cartão em nenhuma hipótese: Supabase Free mais Render Free para API e web
(dormem após 15 min, cerca de 1 min para acordar, sem região no Brasil) serve
para demonstração e homologação, não para cliente pagante; o worker não tem
opção gratuita ali. Northflank Sandbox (2 serviços mais 2 crons sempre ligados,
pede cartão, "não para produção") é o plano B do plano B.

Alternativa de banco: Neon Free em São Paulo (PITR de 6 h, 104 conexões, papel
com CREATEROLE e BYPASSRLS) só se o worker deixar o compute dormir; com o
polling atual, as 100 CU-horas por mês acabam por volta do dia 17.

### 8.5 O que fica fora do Brasil no plano A e por quê

Backup cifrado (R2 ou B2), e-mail transacional (Resend), erros (Sentry, sem
dado pessoal), CI (GitHub). Banco, aplicação e arquivos primários ficam em São
Paulo. Documentar em `docs/SUBPROCESSADORES.md` e no DPA. Se o jurídico
preferir tudo no Brasil: backup no próprio OCI Object Storage em outro
compartimento e conta (perde a separação de provedor), e-mail pelo Amazon SES em
`sa-east-1` (US$ 0,10 por mil, não é gratuito), Sentry desligado.

---

## 9. Até onde a pilha gratuita sustenta

Todas as contas abaixo partem de números medidos e de um perfil de clínica
declarado. Se o perfil for diferente, a conta é a mesma com outros números.

### 9.1 Perfil por clínica

| Grandeza | Pequena | Média |
| --- | --- | --- |
| Veterinários | 2 a 3 | 5 a 8 |
| Recepção e técnicos | 1 a 2 | 3 a 5 |
| Atendimentos por mês | 120 a 200 | 400 a 600 |
| Usuários simultâneos no pico | 5 a 8 | 12 a 15 |
| Requisições por usuário por hora de uso | 60 a 120 | 60 a 120 |
| Documentos anexados por mês | 20 a 60, de 200 KB a 2 MB | 80 a 200 |

Banco: o seed mediu 29 MB para uma clínica com 4 meses (809 agendamentos, 559
atendimentos, 2.285 notas, 3.275 observações), dos quais cerca de 8 MB são
catálogo compartilhado (espécies, raças, permissões, exames). Sobram cerca de
21 MB por 4 meses, ou **cerca de 5 MB por mês por clínica pequena**. Com uso
real a auditoria e o log de acesso crescem mais que no seed; assumir **8 MB por
mês** é conservador. Clínica média: 20 a 25 MB por mês. Um ano de clínica
pequena: cerca de 100 MB.

Arquivos: 40 documentos de 700 KB em média são **cerca de 30 MB por mês por
clínica pequena**, 360 MB por ano; clínica média, 100 MB por mês.

Requisições: 6 usuários, 90 por hora, 8 horas, 26 dias: cerca de 112 mil
requisições por mês por clínica pequena, cerca de 0,4 por segundo no pico.
Cada requisição custa entre 5 e 20 ms de CPU na API (medido em repouso e no
teste de integração), fora o login com argon2 (cerca de 100 ms de CPU e 19 MB
de RAM por vez).

E-mail (só convite e redefinição, sem lembretes): menos de 20 por mês por
clínica. Com lembrete de consulta por e-mail: 150 a 200 por mês por clínica.

### 9.2 Plano A com duas VMs Micro (1 GB cada, 1/8 OCPU com burst)

- Memória: VM 1 com Postgres (50 MB em repouso, até 200 MB com 20 clínicas),
  API (80 MB, picos de 100 MB em login), worker (62 MB), sistema e Docker
  (cerca de 200 MB): cabe com 1 GB. VM 2 com web (66 MB) e Caddy (18 MB):
  folga.
- CPU: 1/8 de OCPU sustentado é cerca de 125 ms de CPU por segundo. A 10 ms
  por requisição, cerca de 12 requisições por segundo sustentadas, com burst.
  Dez clínicas pequenas no pico são 4 requisições por segundo. Logins
  simultâneos são o único momento de estresse (5 logins no mesmo segundo
  consomem meio segundo de CPU e 100 MB).
- Disco: 50 GB de boot, banco de 10 clínicas em um ano é cerca de 1 GB.
- **Sustenta com folga: 8 a 15 clínicas pequenas (50 a 90 usuários, 1.500 a
  2.500 atendimentos por mês, 2 a 3 anos de histórico).** Primeiro gargalo:
  CPU e RAM da VM 1 em horário de pico quando passar de 15 clínicas (a conta
  pura de CPU dá cerca de 20, com margem para login e Postgres na mesma VM
  fica em 15); segundo: o teto de 100 e-mails por dia da Resend se lembretes
  por e-mail forem ligados (com 10 clínicas, cerca de 2 por dia sem lembretes,
  60 com).
- Latência para usuário em São Paulo: 5 a 30 ms de rede, resposta típica
  abaixo de 100 ms.

### 9.3 Plano A com a VM A1 (2 OCPU ARM, 12 GB)

- CPU: 2 OCPU são 2.000 ms de CPU por segundo, cerca de 100 a 200 requisições
  por segundo. Cinquenta clínicas pequenas no pico são 20 por segundo.
- Memória: Postgres pode receber 2 a 4 GB de `shared_buffers`; API com duas
  réplicas; sobra.
- Disco: 200 GB no total (boot de 50 GB mais block volume de 150 GB); 50
  clínicas em três anos são cerca de 15 GB de banco.
- Arquivos: 50 clínicas em um ano são cerca de 18 GB, quase os 20 GB do OCI
  Object Storage. **Este é o primeiro gargalo real da A1: o storage de arquivos
  no fim do primeiro ano com 40 a 60 clínicas.** Sai por US$ 0,0255 por GB por
  mês acima disso, ou migra para R2 a US$ 0,015.
- **Sustenta: 40 a 60 clínicas pequenas (250 a 400 usuários, 8 a 12 mil
  atendimentos por mês).** Segundo gargalo: 100 e-mails por dia da Resend, que
  já com 20 clínicas e lembretes por e-mail estoura (Resend Pro US$ 20 ou
  Amazon SES).
- Risco que não é de capacidade: uma VM só é um ponto único de falha, e a
  Oracle já reduziu o Always Free sem aviso em junho de 2026 e há relatos de
  contas encerradas. Por isso o backup fica em outro provedor e a escada da
  seção 10 sobe cedo.

### 9.4 Variante A2: aplicação na Oracle e banco no Supabase Free

Uma variante legítima do plano A tira o Postgres da VM e o coloca no Supabase
Free em São Paulo. Ganha: os dados sobrevivem se a Oracle reclamar a VM, e o
RTO cai (não há restauração a fazer). Perde: dois tetos que a VM não tem.

- Egress do banco: 5 GB por mês. A hipótese é de 6 KB por requisição (sessão,
  permissões e payload; faixa de 3 a 10 KB, não medida): 93,6 mil requisições
  vezes 6 KB dão 0,55 GB por clínica-mês, mais 0,39 GB fixos do polling do
  worker a cada 2 s (0,03 GB com `WORKER_POLL_MS=30000`). **Cabem 8 a 9
  clínicas pequenas ativas ao mesmo tempo**; com 3 KB por requisição, 17; com
  10 KB, 5. É teto mensal, independe do histórico, e a segunda reincidência
  restringe o projeto até virar o mês.
- Armazenamento: 500 MB, e o banco fica somente leitura ao passar. Descontando
  cerca de 45 MB dos schemas do próprio Supabase, 8 MB de catálogo e 20 MB de
  folga, sobram cerca de 427 MB, ou **71 clínica-meses** a 6 MB por clínica-mês:
  8 clínicas por 9 meses, 6 por 12, 12 por 6.
- Sem backup automático (mesmo RPO de 24 h do `pg_dump` próprio da VM), pausa
  após 7 dias sem atividade (o worker evita), migração de papéis a validar num
  projeto descartável antes.
- Latência API para banco de 2 a 5 ms entre provedores na mesma metrópole
  contra menos de 1 ms na própria VM; TTFB típico de 25 a 70 ms.

Conclusão: A2 sustenta menos (8 a 9 clínicas por egress, 71 clínica-meses por
armazenamento) e não é mais durável, porque nenhum dos dois tem backup
gerenciado no gratuito. Por isso o plano A mantém o Postgres na VM, com o dump
diário fora da Oracle. A2 é a escolha certa se o operador prefere não
administrar Postgres, e vira o estágio 1 da escada naturalmente (Supabase Pro).

### 9.5 Plano B (Supabase Free mais Cloud Run)

- Banco: os mesmos 71 clínica-meses e 8 a 9 clínicas por egress da variante
  A2.
- Compute: 180 mil vCPU-segundos por mês são 50 horas de vCPU; a 100 ms
  faturados por requisição (o Cloud Run cobra por tempo de requisição, não por
  CPU consumida), 936 mil requisições de 10 clínicas dão cerca de 94 mil
  vCPU-s na API, mais web e inicializações, cerca de 124 mil, vezes 1,4 pelo
  Tier 2, cerca de 174 mil. **Cabem 8 a 10 clínicas pequenas**; as 2 milhões
  de requisições gratuitas dariam cerca de 20. Cold start de 1 a 3 s na
  primeira requisição da manhã e depois de pausas; egress de São Paulo fora do
  1 GB gratuito (US$ 1 a 2 por mês, não verificado).
- Arquivos: R2 10 GB, cerca de 256 clínica-meses a 40 MB por mês.
- Sustenta cerca de 8 a 10 clínicas antes de pagar; a experiência de uso é
  pior que a do plano A por causa dos cold starts.

### 9.6 Ressalvas de medição

São medidos: 29 MB de banco para 4 meses de uma clínica (559 atendimentos
finalizados, 38 KB por atendimento com tudo incluído), bytes por linha das
tabelas clínicas, RAM por processo, tempo de boot. São estimativas de
engenharia, não benchmark: 10 a 15 ms de CPU por requisição, 6 KB de egress por
requisição, 20 requisições por segundo sustentadas numa Micro e 100 por OCPU
da A1, latências de 2 a 5 ms entre OCI e AWS em São Paulo. Duas semanas de
uso real da primeira clínica com o painel do provedor e o access log dão os
números de verdade; até lá, tratar as capacidades como ordem de grandeza.

### 9.7 Resposta curta

Com a pilha recomendada, gratuita, você atende de 8 a 15 clínicas pequenas nas
VMs que a Oracle sempre entrega, e de 40 a 60 na VM ARM quando conseguir criá-
la, com um único custo fixo de R$ 40 por ano. A R$ 99 por clínica, 10 clínicas
são R$ 990 por mês de receita contra R$ 3,33 de infraestrutura; o custo real
nesse estágio é a contabilidade da ME (cerca de R$ 100 a R$ 200) e o seu tempo
de suporte. O que muda de estágio não é a capacidade, é o risco: uma clínica
pagante merece banco gerenciado com backup diário e, logo depois, um segundo
servidor, e isso custa US$ 25 a 40 por mês, ou seja, a mensalidade de uma ou
duas clínicas.

---

## 10. Escada de escala

Câmbio de referência: R$ 5,20 por dólar (cotação de 4 a 14 de agosto de 2026
entre 5,19 e 5,22; pagamento em cartão brasileiro sofre IOF de 3,5% mais spread
de cerca de 4%, então o custo efetivo é próximo de R$ 5,60). Recalcular com a
cotação do dia. Receita mínima calculada a R$ 99 por clínica, que é o pior
caso; com o mix real de Essencial e Clínica a cobertura vem antes.

| Estágio | Clínicas | Usuários | Gatilho para subir | O que muda | Custo mensal | Receita mensal mínima para cobrir |
| --- | --- | --- | --- | --- | --- | --- |
| 0. Gratuito | 0 a 10 | até 70 | Terceira clínica pagante (o gratuito não tem backup gerenciado nem SLA), ou CPU da VM acima de 70% no p95, ou banco perto do que a VM comporta | Plano A da seção 8 | US$ 0 (R$ 3,33 do domínio) | R$ 3,33; a contabilidade da ME (R$ 100 a 200) é o custo real |
| 1. Primeiros pagantes | 8 a 40 | 50 a 250 | Terceira clínica pagante, ou VM Micro saturando e sem A1, ou perda de sono com backup | Banco para Supabase Pro em São Paulo (US$ 25 com US$ 10 de crédito de compute: Micro sem custo extra, 8 GB, 250 GB de egress, backups diários por 7 dias, sem pausa) ou Neon Launch (cerca de US$ 19 com 0,25 CU ligado 24 h, PITR); Oracle segue gratuita, com upgrade da tenancy para Pay As You Go e alerta de US$ 1; se faltar CPU, A1 paga de 1 OCPU e 6 GB por cerca de US$ 14 ou VPS de 2 GB em São Paulo por US$ 10 a 12 (região não reverificada); manter o dump próprio para B2 além do backup do Pro | US$ 25 a 39 (R$ 130 a 203; R$ 140 a 220 com IOF e spread) | R$ 130 a 203, ou seja, 1 a 2 clínicas |
| 2. Tração | 40 a 150 | 250 a 900 | CPU do compute Micro do Supabase acima de 60% sustentado, ou p95 da API acima de 300 ms, ou banco acima de 4 GB, ou contrato exigindo 99,5% (uma VM só não entrega), ou 40 clínicas | Supabase Pro com compute Medium (mais US$ 50) e disco de 25 GB (mais US$ 2); dois nós de aplicação atrás do balanceador flexível gratuito da Oracle (10 Mbps) ou da Cloudflare: A1 gratuita mais A1 paga de 2 OCPU e 12 GB (cerca de US$ 28); R2 ou OCI acima do gratuito (US$ 1 a 5); Resend Pro (US$ 20) só se houver lembrete por e-mail; Sentry Team (US$ 26); Grafana Free ainda serve; homologação na segunda Micro | US$ 130 a 175 (R$ 680 a 910) | R$ 790, ou seja, 6 a 8 clínicas; com 100 clínicas a receita é R$ 10.000 |
| 3. Escala | 150 a 500 | 900 a 3.000 | Banco acima de 25 GB, ou compute Medium acima de 60%, ou 150 clínicas, ou exigência contratual de 99,9%, ou lembretes por WhatsApp em volume | Supabase Pro com compute XL (mais US$ 200) e disco de 100 GB (mais US$ 12), réplica de leitura opcional para relatórios (US$ 110 a 210); três nós A1 pagos (US$ 83) ou VPS equivalentes; balanceador pago (cerca de US$ 15, não verificado); Cloudflare Pro (US$ 20 a 25); R2 com 480 GB (US$ 7); Resend Pro (US$ 20); WhatsApp variável (500 clínicas vezes 200 mensagens vezes US$ 0,0068 são US$ 680, repassado como add-on); observabilidade paga (cerca de US$ 80); particionar auditoria e outbox por mês | US$ 470 a 700 fixos (R$ 2.450 a 3.640) mais até US$ 680 variáveis de WhatsApp | R$ 2.600 fixos, ou seja, 18 a 26 clínicas; com 300 clínicas a receita é R$ 30.000 |
| 4. Rede e hospitais | 500 a 1.000 e acima | 3.000 a 6.000 | Mais de 500 clínicas, ou banco acima de 100 GB, ou egress acima de 250 GB por mês, ou exigência de alta disponibilidade multi-AZ, PITR e auditoria LGPD formal | Supabase Team (US$ 599: SOC 2, backups por 14 dias, suporte prioritário) com compute 2XL (mais US$ 400), disco de 300 GB, réplica de leitura e PITR (cerca de US$ 1.545 no total), ou orçar RDS Multi-AZ em `sa-east-1`; quatro a seis nós de aplicação autoescaláveis (US$ 150 a 250); R2 com 1,5 TB (US$ 23); e-mail de 100 a 200 mil por mês (cerca de US$ 100); observabilidade (US$ 150 a 300); WhatsApp variável (até US$ 1.360); DR em segunda região; tenant dedicado por `database_ref` para redes (fase 5 do roadmap); time de operação | US$ 2.000 a 3.500 fixos (R$ 10.400 a 18.200) mais até US$ 1.360 de WhatsApp | R$ 11.200 fixos, ou seja, 75 a 115 clínicas; com 750 clínicas a receita é R$ 75.000 a 150.000 |

Em todos os estágios o custo dominante a partir do 2 é gente (suporte,
implantação, desenvolvimento), não infraestrutura. A infraestrutura fica entre
3% e 15% da receita em qualquer degrau, o que é a vantagem de uma pilha que
cabe em 260 MB por instância. Os números de compute do Supabase (Micro cerca de
US$ 10, Small US$ 15, Medium US$ 60, Large US$ 110, XL US$ 210, 2XL US$ 410,
disco extra US$ 0,125 por GB acima de 8 GB) e da Oracle (US$ 0,01 por OCPU-hora
e US$ 0,0015 por GB-hora na A1) foram lidos em 16 de agosto de 2026.

O que dispara cada subida deve ser medido, não sentido: CPU e RAM da VM
(Grafana ou `docker stats` no cron), tamanho do banco (`pg_database_size` no
`/ready`), p95 de resposta (access log), contagem de e-mails do dia,
`immunizationsDue` e eventos mortos no worker. Um card no painel da plataforma
com esses cinco números evita a surpresa.

---

## 11. Ordem de execução

Uma pessoa desenvolvendo, jurídico e contabilidade em paralelo. Semanas
corridas.

| Semana | Código | Fora do código |
| --- | --- | --- |
| 1, dias 1 a 3 (só correções de horas) | Permissões fantasmas; datas sem hora; `moduleKey` para `key` e contrato do painel de Papéis; módulos sem rota com selo "Em breve"; não devolver `inviteUrl` em produção e exigir autenticação de usuário existente no aceite; bloquear concessão de `owner`; sensibilidade no download de documento; timeouts do pool e `/ready` 503; rate limit em memória e contagem no step-up; `COOKIE_SECURE` forçado e invariantes de produção; papéis globais em `reference-data.ts`; `error.tsx`, `not-found.tsx`, `loading.tsx`; S3 com endpoint público e checksum `WHEN_REQUIRED`; remover `drizzle-orm`, `@nestjs/swagger`, `ioredis` e zerar o `pnpm audit`; `WORKER_POLL_MS=30000` no ambiente | Abrir a ME e o contador; conta no Asaas; busca de anterioridade no INPI e registro do domínio; caixas `contato@`, `suporte@`, `encarregado@` e `seguranca@` via Cloudflare Email Routing; contas Oracle, Cloudflare, Resend, UptimeRobot, Sentry, GitHub |
| 1, dias 4 e 5 | CI mínimo (lint, typecheck, unidade, integração, guarda de RLS, build de imagem com tag) | Encomendar termos, privacidade, DPA e contrato ao jurídico com os fatos técnicos deste documento |
| 2 | Provisionamento de tenant (serviço, CLI, endpoint de plataforma, seed usando a função); e-mail (Resend) em convite e reset; três páginas públicas do web e link no login; listar, reenviar e revogar convites; profissional com CRMV (PATCH e vínculo na membership); backup diário cifrado com restauração testada e custódia das chaves; runbook inicial | Subir a pilha na Oracle com domínio, TLS, UptimeRobot, Sentry e status page; primeira clínica de teste criada pelo CLI |
| 3 | Aceite de termos e privacidade no primeiro login; remarcar agendamento; cancelar atendimento; óbito e procedimento na tela; assumir atendimento; reabrir com step-up; paginação e filtro de período; agenda com atualização automática; resumo de cobrança e cobranças pendentes; preços de vacina e exame; `charge:settle`; tenant `suspended` e trial vencido aplicados na sessão; exportação por organização para saída do cliente; testes de charges e identity | Roteiro de demonstração; página de preços; política de cancelamento e reembolso |
| 4 | Landing estática com preços, termos, privacidade, contato e status; ambiente de demonstração em homologação com reset diário e senha rotativa; checklist de primeiro acesso com link de suporte no menu; importador CSV de tutores, pacientes e vacinas com prévia; catálogo de serviços, unidade e dados fiscais editáveis; vacinas fora do atendimento; anexo de laudo | Vídeo de 5 minutos por fluxo; contrato de piloto |
| 5 | Ações do paciente e do tutor (vincular, alerta, identificador, inativar); sessão deslizante; auditoria de autenticação; `htmlFor`, contraste, `openSignedUrl`, impressão limpa, manifest e ícones; retenção e subprocessadores documentados | Piloto 1 entra (grátis, 60 dias, contrato e DPA assinados); suporte por WhatsApp e e-mail com horário declarado; treinamento de 1 hora |
| 6 | Correções da primeira semana do piloto; planos com limites e trial; relatórios básicos e CSV; catálogo de vacinas com protocolo | Piloto 2 entra; coletar a primeira lista de reclamações |
| 7 | Receita controlada com campos do modelo e textos "responsável pelo animal"; prontuário em PDF completo; hash de integridade verificável; Playwright com seis jornadas | Parecer jurídico dos itens da seção 7.4 |
| 8 | Lembretes em modo manual (tela do dia com `wa.me`); MFA opcional para dono; SAVEPOINT no relay; tick do worker embutido | Primeira proposta comercial; primeira cobrança pelo Asaas com NFS-e; política de reembolso publicada |
| 9 a 12 | Grade semanal da agenda; horários e bloqueios; formulários com `react-hook-form` e máscaras; rascunho local de notas (cifrado, ou retirar a promessa de "nenhum dado clínico no dispositivo"); suítes de integração restantes; CSP; OpenAPI e webhooks para o parceiro | Estágio 1 da escada quando houver 3 clínicas pagantes; conversar com o parceiro de faturamento levando o contrato de `charge_items` |

Se for preciso cortar, a ordem de corte é a inversa: primeiro o que está nas
semanas 9 a 12, depois 8, e assim por diante. Nunca cortar provisionamento,
e-mail com as três páginas, os dois bugs de tela, a correção do convite,
backup testado, termos e DPA, e a empresa.

---

## 12. Riscos e o que não fazer

**Riscos**

- Oracle Always Free: capacidade escassa da A1 em São Paulo, redução de limites
  sem aviso (aconteceu em junho de 2026), relatos de contas encerradas por
  ociosidade ou sem motivo declarado. Mitigação: Pay As You Go com alerta de
  US$ 1, backup em outro provedor, e o estágio 1 da escada cedo.
- Um servidor só: falha de disco ou de VM derruba tudo. Mitigação: backup
  diário testado, `RPO` de 24 h e `RTO` de 1 h documentados no runbook e no
  contrato até o estágio 1.
- Supabase e Neon Free: pausa por inatividade e teto de horas; validar a
  migração de papéis num projeto de teste antes de depender.
- Resend 100 por dia: teto duro compartilhado por todas as clínicas; medir.
- WhatsApp não oficial: banimento do número da clínica; usar só a Cloud API.
- Vercel Hobby: proíbe uso comercial; não hospedar lá.
- Alegar conformidade regulatória antes do parecer.
- Cobrar antes de abrir a ME.
- Rodar piloto com o convite atual: enquanto o token voltar na resposta e o
  aceite de usuário existente não pedir senha, um administrador pode assinar
  em nome de outro veterinário. Corrigir antes de qualquer clínica real
  (bloqueador 3, horas de trabalho).
- Expor o ambiente de demonstração com o seed atual: senha fixa e e-mails
  previsíveis publicados no README.
- Uma pessoa só: sem escrow de código e credenciais para um segundo humano,
  qualquer indisponibilidade do desenvolvedor para o suporte.

**O que não fazer agora**

- Não construir financeiro, estoque, internação, portal do tutor, assinatura
  ICP-Brasil, integração de laboratório nem app nativo antes da Onda 1 e do
  piloto. O documento mestre já diz isso e a análise confirma.
- Não adaptar a API para serverless: contêiner que sobe em menos de 1 segundo
  entrega o mesmo resultado sem retrabalho.
- Não colocar Redis: nada usa e o rate limit em memória basta para uma réplica.
- Não trocar o cookie para SameSite=None para juntar domínios diferentes; usar
  proxy ou subdomínios do mesmo domínio.
- Não rodar o seed de demonstração em produção (ele apaga os tenants `demo` e
  `beta` a cada execução e se recusa a rodar com `APP_ENV=prod`; deixar
  assim).
- Não prometer "receita digital" nem "assinatura digital" enquanto a assinatura
  for eletrônica simples.
- Não deixar `.env` de desenvolvimento servir a pilha de produção.

---

## 13. Apêndices

### A. Provedores verificados em 16 de agosto de 2026

Resumo do que foi lido nas páginas oficiais. Onde a leitura foi indireta ou de
fonte secundária, está marcado com "(secundário)".

**Computação**

| Provedor | Gratuito | Serve? | Fonte |
| --- | --- | --- | --- |
| Oracle Cloud Always Free | A1 total 2 OCPU/12 GB (reduzido de 4/24 em 15/06/2026, com enforcement a partir de 18/08/2026), 2 VMs E2.1.Micro 1 GB, 200 GB de disco, 20 GB Object Storage, 10 TB de saída; São Paulo e Vinhedo como home region; cartão obrigatório | Ideal: única opção sempre ligada, no Brasil, gratuita e permanente | docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm; infoq.com/news/2026/07/oracle-cloud-free-tier-limits (secundário para o corte) |
| Google Cloud Run | 2 milhões de req, 180 mil vCPU-s, 360 mil GiB-s por mês; `southamerica-east1` é Tier 2; e2-micro gratuita só nos EUA; cartão obrigatório | Viável (plano B), com cold start | cloud.google.com/run/pricing; docs.cloud.google.com/free/docs/free-cloud-features |
| Azure Container Apps | 180 mil vCPU-s, 360 mil GiB-s, 2 milhões de req; Brazil South; cartão obrigatório | Viável (plano B) | azure.microsoft.com/en-us/pricing/details/container-apps |
| Render | Web services Free 512 MB, dormem após 15 min, 750 h por workspace, 5 GB de banda; sem worker gratuito; sem Brasil; Postgres Free expira em 30 dias | Só demonstração | render.com/pricing; render.com/docs/free |
| Northflank Sandbox | 2 serviços, 2 crons, 1 addon, sempre ligado, pede cartão, "não para produção" | Plano C | northflank.com/pricing |
| Fly.io | Sem gratuito (trial de 2 h); shared-cpu-1x 256 MB cerca de US$ 2 por mês; GRU disponível | Primeiro degrau pago em São Paulo | fly.io/docs/about/pricing |
| Railway | Trial US$ 5 por 30 dias, depois US$ 1 por mês; sem Brasil | Não | docs.railway.com/reference/pricing/plans |
| Koyeb | Sem gratuito para contas novas desde 02/2026 (Pro US$ 29) | Não | koyeb.com/pricing |
| AWS | Créditos de US$ 100 por 6 meses; conta free fecha ao fim; sem VM sempre grátis | Não | docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier.html |
| Vercel Hobby | Proíbe uso comercial | Não | vercel.com/docs/limits/fair-use-guidelines |
| Netlify, Cloudflare Workers, Zeabur, Back4App, Deno Deploy, Leapcell, Hugging Face | Cotas pequenas, sem processo sempre ligado, ou não rodam Nest | Não | ver relatório de pesquisa |

**Banco de dados**

| Provedor | Gratuito | Serve? | Fonte |
| --- | --- | --- | --- |
| Supabase Free | Postgres 17, 500 MB, 60 conexões diretas e 200 no pooler, São Paulo, sem cartão, sem backup, pausa após 7 dias inativo; usuário `postgres` com CREATEROLE e BYPASSRLS | Ideal como gerenciado gratuito | supabase.com/pricing; supabase.com/docs/guides/platform/free-project-pausing; github.com/supabase/postgres (migração `demote-postgres`) |
| Neon Free | 0,5 GB, 100 CU-horas por mês, autosuspend após 5 min, PITR 6 h, São Paulo, papel com CREATEROLE e BYPASSRLS | Viável só se o worker deixar dormir | neon.com/pricing; neon.com/docs/manage/roles |
| Aiven Free | 1 CPU, 1 GB, 1 GB de disco, 20 conexões, sem Brasil, BYPASSRLS provavelmente indisponível | Não | aiven.io/docs/platform/concepts/free-plan |
| Prisma Postgres, Nile, Xata, Tembo, CockroachDB, Render Postgres, Railway Postgres | Sem Brasil, sem CREATE ROLE, sem extensões, expira, ou não é gratuito | Não | ver relatório de pesquisa |
| Postgres autogerido na VM Oracle | Superusuário, migração sem adaptação, São Paulo | Ideal no plano A | idem Oracle |

**Storage, e-mail, WhatsApp, operação**

| Provedor | Gratuito | Serve? | Fonte |
| --- | --- | --- | --- |
| OCI Object Storage | 20 GB, API S3 com URL assinada, São Paulo | Ideal para arquivos no plano A | idem Oracle |
| Cloudflare R2 | 10 GB, 1 milhão de escritas, 10 milhões de leituras, saída zero; pede cartão ou PayPal para ativar (secundário); sem região Brasil | Ideal para backup e alternativa de arquivos | developers.cloudflare.com/r2/pricing |
| Backblaze B2 | 10 GB, sem cartão, saída até 3x o armazenado; sem Brasil | Segunda cópia de backup | backblaze.com/cloud-storage/pricing |
| Supabase Storage | 1 GB, São Paulo | Só se o banco já estiver lá | supabase.com/pricing |
| Resend | 3.000 por mês, 100 por dia, 1 domínio | Ideal | resend.com/pricing |
| Brevo | 300 por dia com logo (secundário) | Alternativa | fontes de 08/2026 |
| Amazon SES | Sem gratuito para contas novas desde 21/07/2026; US$ 0,10 por mil; São Paulo | Degrau pago | aws.amazon.com/ses/pricing |
| Mailgun, MailerSend, Postmark, SendGrid | 100 por dia com cartão, 500 por mês com cartão, 100 por mês, sem gratuito | Não | ver relatório |
| Meta WhatsApp Cloud API | Sem mensalidade; janela de 24 h gratuita; utilidade cerca de US$ 0,0068 no Brasil (secundário); verificação de empresa para escalar | Ideal | developers.facebook.com/docs/whatsapp/pricing |
| Twilio WhatsApp | US$ 0,005 por mensagem mais Meta | Só se quiser SDK único | twilio.com/docs/usage/trials |
| Z-API, Evolution em modo QR | Fora dos termos da Meta, banimentos em 2026 | Não | ver relatório |
| UptimeRobot | 50 monitores a cada 5 min, status page | Ideal | uptimerobot.com/pricing |
| Better Stack | 10 monitores, 3 GB de logs por 3 dias | Alternativa | betterstack.com/uptime/pricing |
| Sentry | 5 mil erros, 1 usuário | Ideal | sentry.io/pricing |
| Grafana Cloud | 50 GB logs, 50 GB traces, 10 mil séries, 14 dias, 3 usuários | Ideal | grafana.com/pricing |
| Axiom | 500 GB por mês, 30 dias | Alternativa | axiom.co/pricing |
| GitHub Actions | 2.000 minutos por mês em privado | Ideal | docs.github.com/en/billing/concepts/product-billing/github-actions |
| Cloudflare Free (DNS, proxy, TLS) | Sem limite de consultas, proxy, DDoS, Universal SSL | Ideal | cloudflare.com/plans/free |
| Registro.br | R$ 40 por ano (secundário para o valor) | Único custo fixo | registro.br/dominio/precos |
| Let's Encrypt via Caddy | Gratuito, renovação automática | Ideal | letsencrypt.org/docs/rate-limits |
| Asaas | Sem mensalidade; Pix e boleto R$ 1,99; cartão R$ 0,49 mais 2,99% | Ideal para cobrar | asaas.com/precos-e-taxas |
| Stripe Brasil | 3,99% mais R$ 0,39; Billing 0,7%; Pix por convite | Alternativa | stripe.com/br/pricing |

**Concorrentes (preços de agosto de 2026)**

SimplesVet R$ 359 a R$ 979 (simples.vet/precos); Vetus R$ 229,89 a R$ 287,39
para 2 usuários (vetus.com.br); Vet Smart R$ 0, R$ 39,90, R$ 89,90
(pl-vetsmart.zendesk.com); VetSoft Web R$ 0 a R$ 860 (vetsoft.com.br/planos);
Vetwork R$ 119,90 a R$ 399,90 (vetwork.com.br/planos); VetSuite R$ 0 a R$ 250
(vetsuite.com.br/planos); Nuvem Vet R$ 109 (nuvemvet.com/assinar); VetBase R$ 99
a R$ 299 (vetbase.com.br); PetFlow grátis (petflow.app/precos).

**Regulação**

Res. CFMV 1321/2020 (prontuário, receituário, modelos); Res. CFMV 1653/2025
(amplia informações obrigatórias); Res. CFMV 1465/2022 (telemedicina e
assinatura eletrônica); Portaria SVS/MS 344/1998; RDC Anvisa 1.000/2025 e
1028/2026 (receituário eletrônico e SNCR); Portaria MAPA 837/2025 (controle
especial veterinário); LGPD e Res. ANPD 2/2022 e 19/2024; LC 116/2003 (ISS);
Res. CGSN 189/2026 e 191/2026 (NFS-e nacional). A Res. CFMV 1364/2020 trata de
ozonioterapia, não de receituário.

### B. Variáveis obrigatórias por serviço em produção

- **API**: `APP_ENV=prod`, `NODE_ENV=production`, `DATABASE_URL`,
  `DATABASE_IAM_URL`, `DATABASE_ADMIN_URL`, `SESSION_SECRET` (32 ou mais
  caracteres, não o de exemplo), `COLUMN_ENCRYPTION_KEY`, `COLUMN_HASH_KEY`,
  `PUBLIC_APP_URL` (a origem exata que o navegador usa; senão toda mutação
  devolve 403), `COOKIE_SECURE=true`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`,
  `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_FORCE_PATH_STYLE`, e depois da Onda 1
  `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM`. Opcionais:
  `DATABASE_POOL_MAX` (4 em VM pequena), `EXTRA_ALLOWED_ORIGINS`,
  `SESSION_TTL_HOURS`, `SESSION_ABSOLUTE_DAYS`, `STEP_UP_MAX_AGE_MIN`,
  `LOG_LEVEL`.
- **Migrador**: `DATABASE_MIGRATION_URL` (papel dono, conexão direta, nunca
  pooler em modo transação), `DATABASE_ROLE_PASSWORD` (mesma senha das URLs de
  app, iam e admin), `APP_ENV`. Hoje também exige os segredos da API por causa
  do schema único de env; separar.
- **Worker**: `DATABASE_URL`, `DATABASE_ADMIN_URL` (obrigatória na prática:
  sem BYPASSRLS o worker lê zero linhas e parece saudável),
  `WORKER_HEALTH_PORT`, `WORKER_POLL_MS` (30000 em hospedagem com banco que
  dorme).
- **Web**: `NEXT_PUBLIC_API_URL=/api/v1` fixado no build; `PORT`.
- Variáveis mortas hoje: `REDIS_URL`, `SMTP_URL` (até existir mailer),
  `RATE_LIMIT_*` (até existir rate limit), `STORAGE_QUOTA_GB_DEFAULT`,
  `FILES_PUBLIC_HOST` (a reaproveitar como `S3_PUBLIC_ENDPOINT`).

### C. Contas de capacidade, passo a passo

- Banco por clínica por mês: (29 MB medidos menos 8 MB de catálogo) dividido
  por 4 meses = 5,25 MB; com auditoria real, 8 MB. Um ano: 96 MB.
- Arquivos por clínica por mês: 40 documentos vezes 700 KB = 28 MB. Um ano: 336
  MB. Cinquenta clínicas em um ano: 16,8 GB (limite do OCI 20 GB).
- Requisições por clínica por mês: 6 usuários vezes 90 por hora vezes 8 horas
  vezes 26 dias = 112.320. Pico: 6 usuários vezes 120 por hora dividido por
  3.600 = 0,2 por segundo, dobrado por concentração = 0,4.
- CPU necessária: 0,4 req/s vezes 15 ms = 6 ms de CPU por segundo por clínica.
  VM Micro (125 ms/s sustentado): cerca de 20 clínicas no cálculo puro; com
  margem para login (argon2 100 ms) e Postgres na mesma VM, 8 a 12. VM A1
  (2.000 ms/s): 300 no cálculo puro; com margem e Postgres, 40 a 60 até bater
  no storage de arquivos.
- Supabase Free 500 MB dividido por 8 MB por clínica-mês = 62 clínica-meses.
- Cloud Run 2 milhões de requisições dividido por 112 mil = cerca de 18
  clínicas; com cold starts e Tier 2 consumindo mais rápido, 15.
- Resend 100 por dia: sem lembretes, 10 clínicas geram cerca de 2 por dia;
  com lembrete de consulta por e-mail (150 por mês por clínica, 6 por dia),
  16 clínicas.
- Custo por cobrança no Asaas para R$ 99: Pix R$ 1,99 (2,0%); cartão R$ 0,49
  mais R$ 2,96 (3,5%).

### D. O que este documento não cobre

Estimativa de custo de pessoas (suporte, implantação, vendas), plano de
marketing e aquisição, tamanho de mercado em número de clínicas (só preços
foram pesquisados), a minuta dos documentos jurídicos, e o desenho detalhado do
módulo financeiro do parceiro. Preços de provedores mudam; recomenda-se
reconferir a tabela do apêndice A a cada trimestre e sempre antes de subir de
estágio. As afirmações jurídicas e fiscais (MEI vedado, Anexo III ou V, datas
da NFS-e nacional, cláusulas-padrão da ANPD, alcance do CDC) vieram de fontes
públicas e precisam de contador e advogado antes de virar decisão.
