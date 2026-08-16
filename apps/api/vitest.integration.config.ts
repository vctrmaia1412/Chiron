import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

/**
 * Os testes de integração sobem o Nest de verdade, então precisam de
 * `emitDecoratorMetadata`: o esbuild do Vitest não emite, o SWC emite.
 */
export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    include: ['test/**/*.integration.test.ts'],
    globalSetup: ['test/setup/global-setup.ts'],
    hookTimeout: 180_000,
    testTimeout: 60_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    reporters: ['default'],
  },
});
