# 0009 - CPF cifrado em coluna com índice cego

Status: aceito

## Contexto

CPF e CNPJ são dados pessoais e precisam ser buscáveis: a recepção digita o
CPF para achar o tutor.

Cifrar a coluna impede busca por igualdade, porque cifra com IV aleatório
produz texto diferente a cada gravação. Guardar em claro resolve a busca e
expõe tudo em um vazamento de banco. Guardar apenas o hash simples não protege:
CPF tem espaço pequeno e é enumerável em minutos.

## Decisão

Três colunas por documento:

- `document_encrypted`: AES-256-GCM com prefixo de versão da chave
  (`v1:iv:tag:dados`), permitindo rotação gradual;
- `document_hash`: HMAC-SHA256 com chave dedicada, diferente da chave de cifra,
  usado como índice cego para busca por igualdade e para a restrição de
  unicidade;
- `document_masked`: máscara para exibição, sem precisar decifrar.

A busca calcula o HMAC do termo digitado e compara com o índice. A listagem
mostra a máscara. Decifrar só acontece na exportação de dados do titular.

## Consequências

Aceitas:

- busca parcial por documento é impossível, apenas igualdade;
- perder a chave de cifra torna o dado irrecuperável, e perder a chave de hash
  invalida os índices;
- três colunas em vez de uma.

Ganhas:

- vazamento do banco não entrega documento em claro;
- enumeração exige também a chave do HMAC;
- a listagem não precisa decifrar nada, então o caminho comum não toca no dado
  sensível.
