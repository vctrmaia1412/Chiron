import type { Page } from '@playwright/test';
import { expect, expectNoHorizontalOverflow, isMobile, settle, test } from './fixtures';
import type { Role } from './env';

/**
 * Varredura de todas as telas que cada perfil enxerga no menu, no celular e
 * no computador. Cada tela precisa abrir com título, sem mensagem de erro e
 * sem estourar a largura. É o "abri o sistema e saí clicando" de quem usa.
 */
async function menuLinks(page: Page): Promise<string[]> {
  await page.goto('/');
  await settle(page);
  const hrefs = new Set<string>();
  if (isMobile(page)) {
    for (const href of await page.locator('nav a[href^="/"]').evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))) {
      hrefs.add(href);
    }
    await page.getByRole('button', { name: 'Mais', exact: true }).click();
    const dialog = page.getByRole('dialog');
    for (const href of await dialog.locator('a[href^="/"]').evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))) {
      hrefs.add(href);
    }
    await page.keyboard.press('Escape');
  } else {
    for (const href of await page.locator('aside a[href^="/"]').evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))) {
      hrefs.add(href);
    }
  }
  return [...hrefs].filter((href) => href && !href.startsWith('/entrar'));
}

async function expectHealthy(page: Page, label: string): Promise<void> {
  await settle(page);
  await expect(page.locator('main h1').first(), `${label}: título`).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tentar novamente' }), `${label}: mensagem de erro`).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
}

const roles: Role[] = ['vet', 'recepcao', 'tecnico', 'admin'];

for (const role of roles) {
  test.describe(`perfil ${role}`, () => {
    test.use({ role });

    test('todas as telas do menu abrem limpas', async ({ page }) => {
      const links = await menuLinks(page);
      expect(links.length, 'menu sem destinos').toBeGreaterThan(2);
      for (const href of links) {
        await page.goto(href);
        await expectHealthy(page, href);
      }
    });

    test('detalhes abertos a partir das listas', async ({ page }) => {
      const links = await menuLinks(page);
      const details: Array<{ list: string; pattern: RegExp }> = [
        { list: '/pacientes', pattern: /^\/pacientes\/[0-9a-f-]{36}$/ },
        { list: '/tutores', pattern: /^\/tutores\/[0-9a-f-]{36}$/ },
        { list: '/atendimentos', pattern: /^\/atendimentos\/[0-9a-f-]{36}$/ },
      ];
      for (const { list, pattern } of details) {
        if (!links.includes(list)) continue;
        await page.goto(list);
        await settle(page);
        const first = page.locator('main a[href]').filter({ hasNot: page.locator('svg.lucide-plus') });
        const hrefs = await first.evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute('href') ?? ''));
        const target = hrefs.find((href) => pattern.test(href));
        if (!target) continue;
        await page.goto(target);
        if (target.startsWith('/atendimentos/')) {
          await settle(page);
          await expect(page.getByText('Registro clínico').first()).toBeVisible();
          await expect(page.getByRole('button', { name: 'Tentar novamente' })).toHaveCount(0);
          await expectNoHorizontalOverflow(page);
        } else {
          await expectHealthy(page, target);
        }
      }
    });
  });
}
