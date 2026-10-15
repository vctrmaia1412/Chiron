import { defineConfig, devices } from '@playwright/test';

/**
 * Jornadas reais no navegador, contra a pilha de pé (API, web, banco com o
 * seed de demonstração). Cada teste roda em celular e em computador: a
 * clínica usa os dois, e o que quebra num quase nunca aparece no outro.
 *
 * Localmente usa o Chrome instalado na máquina (sem baixar navegador); na
 * CI, o Chromium que o Playwright instala.
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './tests',
  globalSetup: './tests/global-setup.ts',
  // Um por vez: os testes compartilham o banco de demonstração.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
    channel: process.env.CI ? undefined : 'chrome',
  },
  projects: [
    {
      name: 'celular',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 844 },
        channel: process.env.CI ? undefined : 'chrome',
      },
    },
    {
      name: 'computador',
      use: { viewport: { width: 1366, height: 900 } },
    },
  ],
});
