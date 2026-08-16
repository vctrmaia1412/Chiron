# Decisões arquiteturais

Cada arquivo registra uma decisão que seria cara de reverter, com o contexto
que existia, as alternativas consideradas e a consequência aceita.

Não há registro para decisão óbvia nem para escolha de estilo. Se a decisão
puder ser revertida em uma tarde, ela não precisa de ADR.

| ADR | Decisão |
| --- | --- |
| [0001](0001-multi-tenancy-rls.md) | Banco compartilhado com Row Level Security |
| [0002](0002-monolito-modular.md) | Monólito modular em vez de microsserviços |
| [0003](0003-registro-clinico-imutavel.md) | Registro clínico assinado é imutável |
| [0004](0004-prontuario-composto.md) | Prontuário composto por eventos, sem tabela de timeline |
| [0005](0005-check-in-cria-atendimento.md) | Check-in cria o atendimento na mesma transação |
| [0006](0006-dominio-compartilhado.md) | Regras clínicas em pacote compartilhado |
| [0007](0007-pdf-no-servidor.md) | PDF gerado no servidor com PDFKit |
| [0008](0008-outbox-transacional.md) | Eventos por outbox transacional |
| [0009](0009-cifra-de-coluna-e-indice-cego.md) | CPF cifrado em coluna com índice cego |
| [0010](0010-faixas-de-referencia-nao-validadas.md) | Faixa de referência começa informativa |
