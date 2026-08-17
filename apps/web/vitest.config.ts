import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Barra normalizada porque no Windows o caminho vem com contrabarra e o Vite compara em posix.
const srcDir = fileURLToPath(new URL('./src/', import.meta.url)).replace(/\\/g, '/');

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Fuso fixo: a formatação de data depende dele e, rodando em UTC, um teste de
    // deslocamento de dia passaria sem detectar a regressão.
    env: { TZ: 'America/Sao_Paulo' },
  },
  resolve: {
    // Espelha o path `@/*` do tsconfig. Regex para não capturar pacotes com escopo, como @chiron/contracts.
    alias: [{ find: /^@\//, replacement: srcDir }],
  },
});
