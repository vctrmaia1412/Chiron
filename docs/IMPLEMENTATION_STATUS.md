# Situação da implementação

Estado real do CHIRON, verificado por execução, não por intenção. Cada item
marcado como pronto foi exercitado contra banco e API de verdade.

Atualizado em 17 de agosto de 2026.

## Pronto

### Fundação

- Monorepo pnpm com Turborepo: `apps/api`, `apps/worker`, `apps/web`,
  `packages/contracts`, `packages/domain`, `packages/config`.
- Ambiente local em Docker Compose: PostgreSQL 16, Redis, MinIO, Mailpit.
- Pilha completa em contêiner com proxy de origem única, verificada de ponta a
  ponta em `http://localhost:8080`.
- Imagens Docker em múltiplos estágios para API, worker e web, rodando com
  usuário sem privilégio.

### Banco de dados

- 5 migrações versionadas com verificação de hash: migração já aplicada que
  for editada aborta o processo.
- 80 tabelas em 11 schemas, com timestamps, restrições, índices e chaves
  estrangeiras compostas por `(tenant_id, id)`.
- Row Level Security em cinco famílias, com registro declarativo e guarda
  automática que recusa tabela sem política coerente.
- Quatro papéis de banco com responsabilidades distintas, com senha vinda de
  variável de ambiente e não do SQL versionado.
- Triggers de imutabilidade em nota clínica, receita, auditoria, log de acesso
  e movimentação de estoque.
- Restrição de exclusão que impede sobreposição de horário por profissional,
  com escape explícito para encaixe.
- Dados de referência sincronizados a partir dos contratos: 12 módulos, 4
  planos, 121 permissões, 18 espécies, 98 raças, 16 códigos de observação, 21
  exames e 23 faixas de referência.
- Seed de demonstração com duas organizações, 8 usuários, 37 tutores, 72
  pacientes de 8 espécies, 809 agendamentos cobrindo 90 dias de histórico, o
  dia de hoje e 30 dias futuros com status alternados, atendimentos
  finalizados com notas assinadas, receitas, exames, vacinas e itens de
  cobrança em vários estados.

### Segurança e identidade

- Sessão opaca no servidor, identificada pelo HMAC do token, cookie httpOnly.
- Senha com argon2id, bloqueio por tentativas, resposta uniforme para
  credencial inválida.
- Invalidação por versão de permissão.
- Step-up para ações sensíveis.
- Troca de organização com reemissão de sessão.
- Autorização fail closed com módulo, permissão, escopo de unidade e licença
  profissional.
- Negativa de acesso registrada em auditoria.
- Confirmação de organização em mutação, com recusa em caso de divergência.
- CORS com origem explícita e verificação de origem para credencial por cookie.
- CPF e CNPJ cifrados em coluna com índice cego para busca.
- Aceite de convite para e-mail que já tem conta exige a senha daquela conta,
  conferida pelo mesmo caminho do login, com bloqueio e contagem de tentativas.
- Papel de proprietário só é concedido por quem já é proprietário.
- Documento com conteúdo clínico (prontuário, receita, resultado de exame) não
  é listado nem baixado por quem não tem leitura de prontuário sensível, e a
  tentativa vira registro de auditoria.
- Limite de taxa por IP, com cota separada para as rotas que rodam argon2id.
- Auditoria de autenticação: falha de login, logout, revogação de sessão,
  redefinição de senha e aceite de convite.

### Produto

- Cadastro de tutores com exportação e anonimização de dados pessoais.
- Cadastro de pacientes multiespécie com atributos por espécie,
  identificadores, alergias, alertas e histórico de peso.
- Agenda com bloqueios, verificação de conflito, confirmação, cancelamento,
  falta e check-in que abre o atendimento.
- Fila de atendimento e atendimento sem agenda.
- Atendimento com triagem, sinais vitais normalizados por espécie, notas por
  seção com salvamento automático, diagnósticos, procedimentos e finalização
  com conteúdo mínimo, assinatura e hash de integridade.
- Receita com dose calculada por peso, conferência de alergia, carência para
  animais de produção, uso fora de bula com justificativa, assinatura e PDF.
- Exames com pedido, coleta, resultado, retificação que supersede e revisão.
- Vacinas e preventivos com pendência de próxima dose.
- Documentos com upload em duas etapas por URL assinada, verificação de
  conteúdo por magic bytes, download assinado e 11 modelos de PDF.
- Prontuário composto e linha do tempo derivada das fontes de verdade.
- Painel operacional, busca global, leitura de código, notificações internas,
  auditoria e configurações.
- Worker com relay de outbox e quatro tarefas periódicas.

### Operação

- Provisionamento de organização por linha de comando
  (`provision-tenant.ts`), sem SQL à mão: cria organização em avaliação,
  materializa os módulos a partir do plano, cria unidade padrão, proprietário,
  vínculo, registro profissional opcional e o convite para ele definir a
  própria senha.
- Papéis do sistema como catálogo global, sincronizados junto com os demais
  dados de referência: organização nova já nasce com os oito papéis.
- E-mail transacional por API HTTP, com modo seco quando não há chave e recusa
  explícita em produção sem configuração.
- Backup diário cifrado com restauração testada e runbook de operação
  (`docs/RUNBOOK.md`, `infra/scripts/`).
- Integração contínua em GitHub Actions: lint, tipos, unidade, integração com
  PostgreSQL em contêiner e guarda de RLS.
- Readiness que devolve 503 quando o banco não responde, com tempo limite de 2
  segundos, e limite de taxa por IP nas rotas públicas.
- Invariantes de configuração que recusam subir em produção com cookie sem
  Secure, URL pública em localhost, segredo de exemplo ou storage ausente.

### Qualidade

- 85 testes de unidade sobre as regras de domínio e 15 sobre formatação de data
  no web, com fuso fixo.
- 98 testes de integração contra PostgreSQL real, em banco recriado a cada
  execução: isolamento entre organizações, fluxo clínico completo, autorização,
  identidade (login, bloqueio, redefinição, convite, escalada de papel,
  step-up), contrato de cobrança e guarda de RLS varrendo o registro de
  políticas em vez de lista fixa.
- Lint com verificação por tipo nas regras de promessa (uma Promise sem `await`
  em condição é sempre verdadeira, e foi assim que uma guarda de storage deixou
  de guardar), verificação de tipos e build passando em todos os pacotes.

## Não implementado

Nada disso aparece na interface como botão inerte ou tela vazia. O que não
existe simplesmente não é oferecido.

| Área | Situação | Motivo |
| --- | --- | --- |
| Estoque | tabelas existem, sem módulo | Fora do escopo desta etapa. O atendimento já lança item de cobrança, mas não há controle de lote, entrada, saída nem contagem. |
| Faturamento | tabelas existem, sem módulo | Emissão fiscal exige integração com prefeitura e certificado. Hoje o atendimento gera item de cobrança e permite marcar como quitado externamente. |
| Internação | não iniciado | Depende de prescrição com aprazamento e de escala de enfermagem. |
| Cirurgia | não iniciado | Depende de ficha anestésica e de reserva de sala. |
| Portal do tutor | não iniciado | Exige autenticação separada, com modelo de acesso próprio. |
| Lembrete ao tutor por WhatsApp e SMS | não implementado | O e-mail transacional (convite e redefinição de senha) existe desde 17/08/2026. Falta o lembrete proativo ao tutor, que depende de provedor com custo por mensagem. Existe o link manual para WhatsApp nas pendências de vacina. |
| Relatórios gerenciais | não implementado | O painel do dia cobre a operação; produção por profissional, faltas e receita por serviço ainda não. |
| Integração com laboratório | não implementado | Depende de contrato com cada laboratório. A estrutura de resultado já suporta origem por integração. |
| DICOM e PACS | não implementado | Imagem é aceita como arquivo com metadados e vínculos. Visualizador DICOM é evolução, não simulação. |
| Testes de interface | não implementado | O fluxo clínico é coberto por teste de integração na API. Falta teste de componente e navegador. |

## Riscos conhecidos

A revisão de 16 de agosto de 2026, registrada em
[PLANO_DE_LANCAMENTO.md](PLANO_DE_LANCAMENTO.md), encontrou treze bloqueadores
de venda. Em 17 de agosto todos foram implementados e verificados por execução;
o que segue aberto está na seção Não implementado e no próprio plano.

Corrigido nesta rodada, com prova: o botão Finalizar voltou a aparecer (a tela
testava a permissão inexistente `encounter:finish` no lugar de
`encounter:sign`); datas sem hora deixaram de aparecer um dia antes no fuso
brasileiro; o aceite de convite passou a exigir a senha da conta quando o
e-mail já pertence a alguém, e o token deixou de voltar na resposta fora de
desenvolvimento, o que antes permitia a um administrador assinar prontuário em
nome de outro veterinário; criar organização deixou de exigir SQL à mão; existe
envio de e-mail; existe backup com restauração; `/ready` devolve 503 quando o
banco não responde, em vez de 200 pendurado; há limite de taxa nas rotas
públicas.

**Sem verificação de vírus em arquivo enviado.** O upload confere magic bytes
contra o tipo declarado e o campo `virus_scan_status` existe, mas nenhum
scanner está ligado. Em produção, integrar antes de liberar upload a usuário
externo.

**Limite de taxa vale por réplica.** O armazenamento é em memória, porque o
cenário real é uma instância única e o Redis saiu do compose por não ter
consumidor. Com duas ou mais réplicas cada uma passa a contar em separado, o
que ainda segura abuso mas afrouxa o limite. Contador compartilhado só quando
houver mais de uma réplica de verdade.

**Hash de integridade não é assinatura eletrônica.** Comprova que o conteúdo
não mudou, não substitui certificado ICP-Brasil. Os documentos saem com linha
para assinatura e carimbo.

**Faixas de referência iniciais não são validadas.** Por decisão de projeto
(ADR 0010), aparecem como informativas até a clínica validar. Isso é
intencional, mas significa que a clínica precisa configurar antes de ter
alerta confiável.

**Retenção e expurgo por política ainda não existem.** A estrutura de
`retention_until` está no schema e o worker já expurga sessão, token e upload
abandonado, mas não há política de retenção por tipo de documento.

## Próximos passos sugeridos

Em ordem de retorno para quem usa:

A ordem completa, com esforço por item, está na seção 11 de
[PLANO_DE_LANCAMENTO.md](PLANO_DE_LANCAMENTO.md). Em resumo, o que vem agora:

1. Operações diárias que a API já tem e a tela ainda não: remarcar
   agendamento, cancelar atendimento aberto por engano, registrar
   procedimento, registrar óbito, vincular tutor.
2. Testes de navegador (Playwright) sobre o fluxo clínico, complementando os
   98 de API.
3. Aceite de termos de uso, política de privacidade e contrato de operador no
   primeiro acesso, gravando em `iam.terms_acceptances`, que já existe.
4. Planos com efeito real: limite de usuários e de unidades, avaliação com
   prazo, organização suspensa bloqueando escrita.
5. Envio de lembrete por WhatsApp a partir das pendências que já existem.
6. Relatórios gerenciais e exportação em CSV.
7. Estoque, começando por lote e validade de vacina, que já são registrados na
   aplicação mas não controlados.
8. Faturamento sobre os itens de cobrança que o atendimento já gera, em
   parceria.
