import { test as base, expect, type APIRequestContext, type Page, type PlaywrightWorkerArgs } from '@playwright/test';
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
  /** Cliente de API de outro papel, para preparar o cenário (ex.: o veterinário pede o retorno). */
  apiAs: (role: Role) => Promise<Api>;
  pageErrors: string[];
};

export interface Api {
  request: APIRequestContext;
  tenantId: string;
  professionalId: string | null;
  get<T = unknown>(path: string): Promise<T>;
  post<T = unknown>(path: string, data?: unknown): Promise<T>;
  patch<T = unknown>(path: string, data?: unknown): Promise<T>;
}

async function createApi(playwright: PlaywrightWorkerArgs['playwright'], role: Role, origin: string): Promise<Api> {
  const request = await playwright.request.newContext({
    storageState: storageFor(role),
    extraHTTPHeaders: { Origin: origin },
  });
  const me = await (await request.get(`${API_URL}/me/context`)).json();
  const tenantId: string = me.tenant.id;
  const headers = { 'X-Chiron-Tenant': tenantId };
  async function parse<T>(method: string, path: string, response: Awaited<ReturnType<APIRequestContext['get']>>) {
    if (!response.ok()) throw new Error(`${method} ${path}: ${response.status()} ${await response.text()}`);
    return (await response.json()) as T;
  }
  return {
    request,
    tenantId,
    professionalId: me.membership?.professionalId ?? null,
    async get<T>(path: string) {
      return parse<T>('GET', path, await request.get(`${API_URL}${path}`));
    },
    async post<T>(path: string, data?: unknown) {
      return parse<T>('POST', path, await request.post(`${API_URL}${path}`, { data: data ?? {}, headers }));
    },
    async patch<T>(path: string, data?: unknown) {
      return parse<T>('PATCH', path, await request.patch(`${API_URL}${path}`, { data: data ?? {}, headers }));
    },
  };
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
    const api = await createApi(playwright, role, baseURL ?? 'http://localhost:3000');
    await use(api);
    await api.request.dispose();
  },

  apiAs: async ({ playwright, baseURL }, use) => {
    const created: Api[] = [];
    await use(async (role) => {
      const api = await createApi(playwright, role, baseURL ?? 'http://localhost:3000');
      created.push(api);
      return api;
    });
    await Promise.all(created.map((api) => api.request.dispose()));
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

/** O botão que estiver à vista: barra inferior no celular, cabeçalho no computador. */
export function visibleButton(page: Page, name: string) {
  return page.getByRole('button', { name, exact: true }).locator('visible=true').first();
}

/**
 * Salva o agendamento e, se o horário já estiver ocupado para o profissional
 * (o banco de demonstração é compartilhado entre execuções), usa o encaixe
 * que a própria tela oferece.
 */
export async function submitScheduling(page: Page, buttonName: string, successText: string): Promise<void> {
  const form = page.getByRole('dialog');
  await form.getByRole('button', { name: buttonName, exact: true }).click();
  const success = page.getByText(successText).first();
  const overlap = form.getByLabel('Agendar mesmo assim (encaixe)');
  await expect(success.or(overlap)).toBeVisible();
  if (await overlap.isVisible()) {
    await overlap.check();
    await form.getByRole('button', { name: buttonName, exact: true }).click();
  }
  await expect(success).toBeVisible();
}

