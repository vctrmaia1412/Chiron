import { test as base, expect } from '@playwright/test';
import { PASSWORD, ROLES } from './env';

/**
 * Entrar sem sessão: senha errada explica, e quem caiu no login a partir de
 * um link volta para a tela que pediu, não para o painel.
 */
const test = base.extend({ storageState: { cookies: [], origins: [] } });

test('senha errada mostra mensagem e não entra', async ({ page }) => {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(ROLES.recepcao);
  await page.getByLabel('Senha', { exact: true }).fill('senha-errada-123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(page).toHaveURL(/\/entrar/);
});

test('link direto sem sessão volta para a mesma tela depois do login', async ({ page }) => {
  await page.goto('/pacientes?q=Thor');
  await page.waitForURL(/\/entrar\?.*voltar=/);
  await page.getByLabel('E-mail').fill(ROLES.recepcao);
  await page.getByLabel('Senha', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(/\/pacientes\?q=Thor$/);
  await expect(page.locator('main h1').first()).toContainText('Pacientes');
});

test('voltar para fora do sistema é ignorado', async ({ page }) => {
  await page.goto('/entrar?voltar=//exemplo.com/roubo');
  await page.getByLabel('E-mail').fill(ROLES.recepcao);
  await page.getByLabel('Senha', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL((url) => url.pathname === '/');
  expect(new URL(page.url()).host).not.toContain('exemplo.com');
});
