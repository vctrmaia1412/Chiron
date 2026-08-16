# 0007 - PDF gerado no servidor com PDFKit

Status: aceito

## Contexto

Receita, atestado, termo de consentimento e carteira de vacinação precisam
virar PDF. Opções:

1. **Impressão do navegador.** Zero infraestrutura, resultado imprevisível
   entre navegadores e nada fica arquivado.
2. **Chromium headless (Puppeteer).** Fidelidade de HTML e CSS, ao custo de
   algumas centenas de megabytes na imagem e um processo pesado por documento.
3. **Biblioteca de PDF no servidor (PDFKit).** Layout programático, imagem
   leve, geração em milissegundos.

## Decisão

PDFKit, gerando no servidor de forma síncrona.

O documento gerado é arquivado como qualquer outro: entra em
`documents.documents`, vinculado ao paciente e ao atendimento, com hash e
tamanho. Assinar uma receita gera o PDF e o arquiva na mesma transação.

## Consequências

Aceitas:

- layout é escrito em código, não em HTML, então mudança visual exige
  programação;
- não há editor de modelo para a clínica personalizar livremente.

Ganhas:

- imagem pequena e geração rápida, adequada a documento de balcão;
- resultado idêntico independente do navegador de quem clicou;
- o documento fica arquivado e rastreável, não só baixado.

## Descartado

`@react-pdf/renderer` foi considerado por permitir layout em JSX, mas traz o
reconciliador do React para o servidor e não resolve nada que o PDFKit já não
resolva para documentos desta natureza.
