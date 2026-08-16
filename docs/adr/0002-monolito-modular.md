# 0002 - Monólito modular em vez de microsserviços

Status: aceito

## Contexto

O sistema tem áreas bem distintas: agenda, clínica, laboratório, imunização,
documentos, financeiro. É tentador transformar cada uma em serviço.

Mas as operações centrais atravessam essas áreas dentro de uma transação. O
check-in marca a chegada e abre o atendimento. A finalização assina notas,
sela o registro e lança cobrança. Quebrar isso em serviços transforma
transação em coreografia, e coreografia em estado intermediário inconsistente
que alguém vai ter que reconciliar à mão.

## Decisão

Um processo de API com módulos de fronteira clara em `src/modules/<área>`, mais
um worker para o que não é síncrono.

Módulo conversa com módulo por serviço injetado ou por evento. Nenhum módulo
consulta a tabela do vizinho diretamente.

## Consequências

Aceitas:

- escala é por réplica do processo inteiro, não por área;
- a fronteira entre módulos é convenção sustentada por revisão, não imposta
  pela rede.

Ganhas:

- operação simples: um deploy, um log, um banco;
- transação de verdade onde a regra clínica exige;
- extrair um módulo depois continua possível, porque a fronteira já existe.

## Reversibilidade

Alta para extrair um módulo com pouca conversa transacional (documentos,
notificações). Baixa para separar clínica de agenda, e é justamente por isso
que essas duas ficam juntas.
