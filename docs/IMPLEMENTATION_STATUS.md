# Situação da implementação

Estado real do CHIRON, verificado por execução, não por intenção. Cada item
marcado como pronto foi exercitado contra banco e API de verdade.

Atualizado em 16 de agosto de 2026 (seed e riscos revisados no mesmo dia).

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

### Qualidade

- 85 testes de unidade sobre as regras de domínio.
- 58 testes de integração contra PostgreSQL real, em banco recriado a cada
  execução, incluindo o teste obrigatório de isolamento entre organizações e o
  fluxo clínico completo.
- Lint, verificação de tipos e build passando em todos os pacotes.

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
| Envio de e-mail e WhatsApp | não implementado | Existe apenas notificação interna. Um handler que fingisse enviar seria pior que a ausência dele. |
| Integração com laboratório | não implementado | Depende de contrato com cada laboratório. A estrutura de resultado já suporta origem por integração. |
| DICOM e PACS | não implementado | Imagem é aceita como arquivo com metadados e vínculos. Visualizador DICOM é evolução, não simulação. |
| Relatórios gerenciais | não implementado | O painel do dia cobre a operação; relatório histórico ainda não. |
| Testes de interface | não implementado | O fluxo clínico é coberto por teste de integração na API. Falta teste de componente e navegador. |

## Riscos conhecidos

A revisão de 16 de agosto de 2026 registrada em
[PLANO_DE_LANCAMENTO.md](PLANO_DE_LANCAMENTO.md) encontrou, além dos itens
abaixo, treze bloqueadores de venda que este documento não listava. Os que
mais importam para quem for usar hoje: o botão Finalizar do atendimento não
aparece na interface porque testa uma permissão inexistente
(`encounter:finish` em vez de `encounter:sign`); datas sem hora aparecem um dia
antes no navegador em fuso brasileiro; o aceite de convite emite sessão para
usuário já existente sem pedir senha e o token bruto volta na resposta da
API; não existe criação de organização fora do seed; nenhum e-mail é enviado,
então redefinição de senha não funciona em produção; não existe backup. A
lista completa, com evidência e correção, está no plano.

**Sem verificação de vírus em arquivo enviado.** O upload confere magic bytes
contra o tipo declarado e o campo `virus_scan_status` existe, mas nenhum
scanner está ligado. Em produção, integrar antes de liberar upload a usuário
externo.

**Sem limite de taxa efetivo.** As variáveis de configuração existem e o Redis
está no ambiente, mas o middleware não está implementado. O login já tem
bloqueio por tentativas, o que cobre o caso mais crítico.

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

1. Limite de taxa por IP e por conta, usando o Redis que já está no ambiente.
2. Envio de lembrete por WhatsApp a partir das pendências que já existem.
3. Estoque, começando por lote e validade de vacina, que já são registrados na
   aplicação mas não controlados.
4. Faturamento sobre os itens de cobrança que o atendimento já gera.
5. Relatórios gerenciais: produção por profissional, retorno por espécie,
   receita por serviço.
6. Testes de navegador sobre o fluxo clínico, complementando os de API.
