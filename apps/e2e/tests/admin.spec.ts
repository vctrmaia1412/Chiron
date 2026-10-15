import { expect, expectNoHorizontalOverflow, settle, test, uniqueName } from './fixtures';

/**
 * A dona da clínica configurando o que a equipe usa: serviços com preço em
 * reais, módulos com confirmação e convites que não deixam ninguém sem saber
 * se deu certo.
 */
test.use({ role: 'admin' });

async function openSettings(page: import('@playwright/test').Page, tab: string) {
  await page.goto('/configuracoes');
  await settle(page);
  await page.getByRole('tab', { name: tab }).click();
  await settle(page);
}

test('serviço: cria com preço em reais, edita e desativa', async ({ page }) => {
  const name = uniqueName('Banho terapêutico');
  await openSettings(page, 'Catálogos');
  await page.getByRole('button', { name: 'Novo serviço' }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Nome').fill(name);
  await form.getByLabel('Categoria').selectOption({ index: 0 });
  await form.getByLabel('Duração (min)').fill('40');
  await form.getByLabel('Preço padrão (R$)').fill('85,50');
  await form.getByRole('button', { name: 'Criar' }).click();
  await expect(page.getByText('Serviço criado.').first()).toBeVisible();

  const row = page.getByRole('button', { name: new RegExp(name) });
  await expect(row).toContainText('85,50');
  await expectNoHorizontalOverflow(page);

  await row.click();
  const edit = page.getByRole('dialog');
  await expect(edit.getByLabel('Preço padrão (R$)')).toHaveValue('85,50');
  await edit.getByLabel('Preço padrão (R$)').fill('abc');
  await edit.getByRole('button', { name: 'Salvar' }).click();
  await expect(edit.getByText('Use um valor como 180 ou 180,50.')).toBeVisible();
  await edit.getByLabel('Preço padrão (R$)').fill('');
  await edit.getByLabel(/Ativo/).uncheck();
  await edit.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Serviço atualizado.').first()).toBeVisible();
  await expect(row).toContainText('sem preço');
  await expect(row).toContainText('Inativo');
});

test('módulo: desligar pede confirmação, e "Em breve" não liga', async ({ page }) => {
  await openSettings(page, 'Módulos');
  await page.getByRole('switch', { name: 'Desligar Comunicações' }).click();
  const confirm = page.getByRole('dialog');
  await expect(confirm.getByText('Desligar Comunicações?')).toBeVisible();
  await confirm.getByRole('button', { name: 'Manter ligado' }).click();
  await expect(page.getByRole('switch', { name: 'Desligar Comunicações' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Em breve').first()).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Ligar Estoque' })).toHaveCount(0);
});

test('convite: técnico sem CRMV, veterinário exige CRMV, pendente e revogado', async ({ page }) => {
  const email = `e2e.${Date.now().toString(36)}@exemplo.dev`;
  await openSettings(page, 'Equipe');

  await page.getByRole('button', { name: 'Convidar' }).first().click();
  let form = page.getByRole('dialog');
  await form.getByLabel('E-mail').fill(email);
  await form.getByLabel('Papel').selectOption('veterinarian');
  await form.getByRole('button', { name: 'Enviar convite' }).click();
  await expect(form.getByLabel('Número do CRMV')).toHaveAttribute('aria-invalid', 'true');

  await form.getByLabel('Papel').selectOption('technician');
  await expect(form.getByLabel('Número do CRMV')).toHaveCount(0);
  await form.getByRole('button', { name: 'Enviar convite' }).click();
  form = page.getByRole('dialog');
  await expect(form.getByText(/Convite enviado para/)).toBeVisible();
  await expect(form.getByText(email)).toBeVisible();
  await page.keyboard.press('Escape');

  const pending = page.locator('li', { hasText: email });
  await expect(pending).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await pending.getByRole('button', { name: `Revogar convite para ${email}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Revogar convite' }).click();
  await expect(page.locator('li', { hasText: email })).toHaveCount(0);
});
