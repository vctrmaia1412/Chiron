import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

/**
 * Configuração compartilhada por API, worker e pacotes. O app web tem a sua
 * própria (regras do Next). As regras aqui são poucas e todas com motivo:
 * pegar erro real, não impor estilo, que já é responsabilidade do Prettier.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/.turbo/**',
      'apps/web/**',
      '**/*.config.mjs',
      '**/*.config.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { ecmaVersion: 2023, sourceType: 'module' },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports', fixStyle: 'inline-type-imports' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
  {
    // Scripts de linha de comando existem para falar com quem executou.
    files: [
      'apps/api/src/database/**/*.ts',
      'apps/worker/src/**/*.ts',
      'apps/api/test/**/*.ts',
    ],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['apps/api/**/*.ts'],
    rules: {
      // A injeção de dependência do Nest lê os tipos do construtor em tempo de
      // execução. Trocar por `import type` apaga esse metadado e quebra a DI,
      // então a regra fica desligada aqui de propósito.
      '@typescript-eslint/consistent-type-imports': 'off',
      // Falso positivo com decorators: o schema declarado no módulo é usado
      // dentro de `@Body(...)`, que a regra não enxerga como leitura.
      'no-useless-assignment': 'off',
    },
  },
);
