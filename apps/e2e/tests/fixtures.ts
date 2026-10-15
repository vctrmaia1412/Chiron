import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test';
import { API_URL, storageFor, type Role } from './env';

/**
 * Guarda que vale para todo teste: erro de JavaScript na página reprova, e a
 * tela nunca pode ficar mais larga que o aparelho (rolagem lateral no celular
 * é sinal de layout quebrado). Erros de rede esperados (sessão sondada antes
 * do login) ficam de fora.
 */
type Fixtures = {
  role: Role;
  api: Api;
  pageErrors: string[];
};

export interface Api {
  request: APIRequestContext;
  tenantId: string;
  professionalId: string | null;
  get<T = unknown>(path: string): Promise<T>;
  post<T = unknown>(path: string, data?: unknown): Promise<T>;
}

export const test = base.extend<Fixtures>({
  role: ['vet', { option: true }],

  storageState: async ({ role }, use) => {
    await use(storageFor(role));
  },

  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
      page.on('console', (message) => {
        const text = message.text();
        if (message.type() !== 'error') return;
        if (/401|Unauthorized|favicon|Failed to load resource: the server responded with a status of 4\d\d/.test(text)) return;
        errors.push(`console: ${text}`);
      });
      await use(errors);
      expect(errors, 'erros no navegador durante o teste').toEqual([]);
    },
    { auto: true },
  ],

  api: async ({ playwright, role, baseURL }, use) => {
    const request = await playwright.request.newContext({
      storageState: storageFor(role),
      extraHTTPHeaders: { Origin: baseURL ?? 'http://localhost:3000' },
    });
    const me = await (await request.get(`${API_URL}/me/context`)).json();
    const tenantId: string = me.tenant.id;
    const api: Api = {
      request,
      tenantId,
      professionalId: me.membership?.professionalId ?? null,
      async get<T>(path: string) {
        const response = await request.get(`${API_URL}${path}`);
        if (!response.ok()) throw new Error(`GET ${path}: ${response.status()} ${await response.text()}`);
        return (await response.json()) as T;
      },
      async post<T>(path: string, data?: unknown) {
        const response = await request.post(`${API_URL}${path}`, {
          data: data ?? {},
          headers: { 'X-Chiron-Tenant': tenantId },
        });
        if (!response.ok()) throw new Error(`POST ${path}: ${response.status()} ${await response.text()}`);
        return (await response.json()) as T;
      },
    };
    await use(api);
    await request.dispose();
  },
});

export { expect };

/** A página não pode ser mais larga que a tela. */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll('body *')]
      .filter((element) => {
        const style = getComputedStyle(element);
        if (style.position === 'fixed') return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.right > width + 1 && !element.closest('[data-scroll-x]') && !hasScrollingAncestor(element);
      })
      .slice(0, 3)
      .map((element) => `${element.tagName.toLowerCase()}.${String(element.className).slice(0, 50)}`);

    function hasScrollingAncestor(element: Element): boolean {
      let parent = element.parentElement;
      while (parent && parent !== document.body) {
        const overflowX = getComputedStyle(parent).overflowX;
        if (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'hidden') return true;
        parent = parent.parentElement;
      }
      return false;
    }

    return { scrollWidth: document.documentElement.scrollWidth, width, offenders };
  });
  expect(overflow.scrollWidth, `página mais larga que a tela: ${overflow.offenders.join(', ')}`).toBeLessThanOrEqual(
    overflow.width + 1,
  );
}

/** Espera a tela assentar: requisições terminadas e esqueletos de carga fora. */
export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await expect(page.locator('.animate-pulse').first()).toBeHidden({ timeout: 15_000 }).catch(() => undefined);
}

export function isMobile(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1366) < 1024;
}

/** Nome único por execução, para o teste achar o que ele mesmo criou. */
export function uniqueName(prefix: string): string {
  const stamp = Date.now().toString(36).slice(-5).toUpperCase();
  return `${prefix} ${stamp}`;
}
