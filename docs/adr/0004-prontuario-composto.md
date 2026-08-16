# 0004 - Prontuário composto por eventos, sem tabela de linha do tempo

Status: aceito

## Contexto

A tela de histórico precisa mostrar, em ordem, coisas de origens diferentes:
notas, sinais vitais, diagnósticos, receitas, exames, vacinas, documentos.

O caminho mais rápido é criar uma tabela `timeline_events` e escrever nela a
cada ação. É rápido de implementar e rápido de consultar.

Também cria uma segunda fonte de verdade. Quando o registro original é
corrigido e o evento não, a tela passa a mostrar algo que não está no
prontuário. Em documentação clínica isso é inaceitável.

## Decisão

A linha do tempo é derivada, por `UNION ALL` sobre as tabelas de origem. Cada
item carrega a tabela e o id de onde veio.

Não existe tabela de eventos para desenhar tela. A tabela `platform.domain_events`
existe para outra coisa: entrega de efeito colateral (ADR 0008).

## Consequências

Aceitas:

- a consulta é mais cara que ler uma tabela plana;
- incluir um tipo novo de evento exige alterar a união;
- paginação sobre união exige cuidado com ordenação estável.

Ganhas:

- é impossível a linha do tempo divergir do prontuário;
- correção no registro aparece na hora, sem job de reconciliação;
- a redação por sensibilidade acontece em um lugar só.

## Se a consulta pesar

O caminho é uma view materializada com atualização a partir da própria origem,
não uma tabela escrita à mão pelos casos de uso. A fonte de verdade continua
sendo o registro clínico.
