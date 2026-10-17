import { request, type FullConfig } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { API_URL, PASSWORD, ROLES, storageFor } from './env';

/**
 * Entra uma vez com cada perfil e guarda a sessão. Os testes começam já
 * autenticados, como alguém que abre o sistema de manhã, e o login em si tem
 * teste próprio.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL ?? 'http://localhost:3000';
  for (const [role, email] of Object.entries(ROLES)) {
    const context = await request.newContext({ extraHTTPHeaders: { Origin: baseURL } });
    const response = await context.post(`${API_URL}/auth/login`, { data: { email, password: PASSWORD } });
    if (!response.ok()) {
      throw new Error(`Login de ${role} (${email}) falhou: ${response.status()} ${await response.text()}`);
    }
    // Quem participa de várias clínicas (o administrador do seed) entra na de
    // demonstração, como faria escolhendo na tela de login.
    const login = (await response.json()) as {
      activeTenantId: string | null;
      availableTenants: Array<{ id: string; slug: string }>;
    };
    if (!login.activeTenantId && login.availableTenants.length > 0) {
      const target = login.availableTenants.find((tenant) => tenant.slug === 'demo') ?? login.availableTenants[0]!;
      const chosen = await context.post(`${API_URL}/me/context`, { data: { tenantId: target.id } });
      if (!chosen.ok()) throw new Error(`Escolha de clínica de ${role} falhou: ${chosen.status()}`);
    }
    const file = storageFor(role as keyof typeof ROLES);
    mkdirSync(dirname(file), { recursive: true });
    await context.storageState({ path: file });
    await context.dispose();
  }
}
