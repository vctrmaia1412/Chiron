import { test as base, expect } from '@playwright/test';
import { expectNoHorizontalOverflow } from './fixtures';

/**
 * O veterinário do piloto chega pelo link, cria a conta e a clínica sozinho
 * e cai no painel com o caminho do primeiro dia. Sem sessão nenhuma antes.
 */
const test = base.extend({ storageState: { cookies: [], origins: [] } });

test('cria a conta e a clínica e começa pelo primeiro paciente', async ({ page }) => {
  const stamp = Date.now().toString(36);
  await page.goto('/entrar');
  await page.getByRole('link', { name: 'Criar conta grátis' }).click();
  await page.waitForURL('**/criar-conta');
  await expectNoHorizontalOverflow(page);

  // sem CRMV, o veterinário vê o erro no campo antes de enviar
  await page.getByLabel('Seu nome').fill('Dra. Teste Piloto');
  await page.getByLabel('E-mail').fill(`piloto.${stamp}@exemplo.dev`);
  await page.getByLabel('Senha', { exact: true }).fill('senha-do-piloto-2026');
  await page.getByLabel('Nome da clínica').fill(`Clínica Piloto ${stamp}`);
  await page.getByLabel('Li e concordo com as condições do piloto').check();
  await page.getByRole('button', { name: 'Criar minha clínica' }).click();
  await expect(page.getByText('Informe o número do CRMV.')).toBeVisible();

  await page.getByLabel('Número do CRMV').fill('12345');
  await page.getByLabel('UF do CRMV').selectOption('SP');
  await page.getByRole('button', { name: 'Criar minha clínica' }).click();

  await page.waitForURL((url) => url.pathname === '/');
  await expect(page.getByText('Sua clínica está pronta')).toBeVisible();
  await expect(page.getByText('Demonstração:')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  await page.getByRole('link', { name: /Cadastre o primeiro paciente/ }).click();
  await expect(page.getByRole('dialog').getByText('Novo paciente').first()).toBeVisible();
});

test('e-mail que já tem conta leva para entrar ou recuperar a senha', async ({ page }) => {
  await page.goto('/criar-conta');
  await page.getByLabel('Seu nome').fill('Alguém');
  await page.getByLabel('E-mail').fill('vet@chiron.dev');
  await page.getByLabel('Senha', { exact: true }).fill('senha-do-piloto-2026');
  await page.getByLabel('Nome da clínica').fill('Clínica Repetida');
  await page.getByLabel('Sou médico(a)-veterinário(a) e vou atender pelo sistema').uncheck();
  await page.getByLabel('Li e concordo com as condições do piloto').check();
  await page.getByRole('button', { name: 'Criar minha clínica' }).click();
  await expect(page.getByText('Este e-mail já tem conta.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'recuperar a senha' })).toBeVisible();
});
