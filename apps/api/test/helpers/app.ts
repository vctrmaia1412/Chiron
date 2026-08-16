import { applyTestEnv } from '../setup/test-database';

applyTestEnv();

import type { NestFastifyApplication } from '@nestjs/platform-fastify';

export interface TestClient {
  app: NestFastifyApplication;
  request: (options: {
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    url: string;
    payload?: unknown;
    cookie?: string;
    tenant?: string;
    headers?: Record<string, string>;
  }) => Promise<{ status: number; body: any; cookie: string | undefined; headers: Record<string, unknown> }>;
  login: (email: string, password?: string, tenantSlug?: string) => Promise<Session>;
  close: () => Promise<void>;
}

export interface Session {
  cookie: string;
  tenantId: string | null;
  userId: string;
}

const COOKIE_NAME = process.env.COOKIE_NAME ?? 'chiron_session';

export async function createTestClient(): Promise<TestClient> {
  const { createApp } = await import('../../src/main');
  const app = await createApp();
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  const prefix = process.env.API_PREFIX ?? '/api/v1';

  const request: TestClient['request'] = async ({ method, url, payload, cookie, tenant, headers }) => {
    const response = await app.inject({
      method,
      url: `${prefix}${url}`,
      payload: payload as never,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(tenant ? { 'x-chiron-tenant': tenant } : {}),
        ...(headers ?? {}),
      },
    });

    const setCookie = response.headers['set-cookie'];
    const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [String(setCookie)] : [];
    const session = cookies.find((c) => c.startsWith(`${COOKIE_NAME}=`));

    let body: unknown = null;
    try {
      body = response.body ? JSON.parse(response.body) : null;
    } catch {
      body = response.body;
    }

    return {
      status: response.statusCode,
      body,
      cookie: session ? (session.split(';')[0] as string) : undefined,
      headers: response.headers as Record<string, unknown>,
    };
  };

  const login: TestClient['login'] = async (email, password = 'Chiron@2026', tenantSlug = 'demo') => {
    const response = await request({ method: 'POST', url: '/auth/login', payload: { email, password } });
    if (response.status !== 200 && response.status !== 201) {
      throw new Error(`Login falhou para ${email}: ${response.status} ${JSON.stringify(response.body)}`);
    }
    if (!response.cookie) throw new Error(`Login de ${email} não devolveu cookie de sessão.`);

    let cookie = response.cookie;
    let tenantId: string | null = response.body.activeTenantId ?? null;

    // Usuário com mais de uma organização entra sem tenant ativo: escolhe uma.
    if (!tenantId) {
      const target = (response.body.availableTenants ?? []).find(
        (t: { slug: string }) => t.slug === tenantSlug,
      );
      if (!target) {
        throw new Error(`Usuário ${email} não participa da organização ${tenantSlug}.`);
      }
      const switched = await request({
        method: 'POST',
        url: '/me/context',
        cookie,
        payload: { tenantId: target.id },
      });
      if (switched.status >= 400) {
        throw new Error(`Troca de organização falhou: ${switched.status} ${JSON.stringify(switched.body)}`);
      }
      if (switched.cookie) cookie = switched.cookie;
      tenantId = target.id;
    }

    return { cookie, tenantId, userId: response.body.user.id };
  };

  return {
    app,
    request,
    login,
    close: async () => {
      await app.close();
    },
  };
}
