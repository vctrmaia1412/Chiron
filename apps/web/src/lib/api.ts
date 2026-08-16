import { ERROR_CODES, type ErrorCode } from '@chiron/contracts';

/**
 * Cliente único da API. Toda chamada do frontend passa por aqui:
 *
 * - a sessão viaja em cookie httpOnly, então o navegador nunca vê o token;
 * - mutação confirma a organização ativa pelo cabeçalho X-Chiron-Tenant, e o
 *   servidor recusa se divergir da sessão (aba antiga após troca de tenant);
 * - erro sempre chega no mesmo formato, com código estável.
 *
 * O tenant enviado no cabeçalho é confirmação, nunca autoridade: quem decide
 * é a sessão no servidor.
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? 'http://localhost:3333/api/v1';

export interface ApiErrorBody {
  code: ErrorCode | string;
  message: string;
  details?: unknown;
  requestId?: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isAuthError(): boolean {
    return this.code === 'UNAUTHENTICATED' || this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }

  /** Mensagens por campo, quando o servidor devolve falha de validação. */
  get fieldIssues(): Array<{ path: string; message: string }> {
    const details = this.details as { issues?: Array<{ path: string; message: string }> } | undefined;
    return details?.issues ?? [];
  }
}

let activeTenantId: string | null = null;
let onUnauthenticated: (() => void) | null = null;

export function setActiveTenantId(tenantId: string | null): void {
  activeTenantId = tenantId;
}

export function setUnauthenticatedHandler(handler: (() => void) | null): void {
  onUnauthenticated = handler;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  signal?: AbortSignal;
  /** Não dispara o fluxo de sessão expirada (usado no /me/context inicial). */
  silentAuth?: boolean;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  // A base é relativa por padrão (`/api/v1`), porque o navegador fala com o
  // proxy na mesma origem. `new URL` recusa caminho relativo sem base, então a
  // query é montada à mão: assim vale tanto para a base relativa quanto para
  // uma URL absoluta em desenvolvimento fora do Docker.
  const target = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return target;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === '') continue;
    params.set(key, String(value));
  }

  const search = params.toString();
  if (!search) return target;
  return `${target}${target.includes('?') ? '&' : '?'}${search}`;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };

  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && activeTenantId) {
    headers['X-Chiron-Tenant'] = activeTenantId;
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      credentials: 'include',
      cache: 'no-store',
      signal: options.signal,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK_ERROR', 'Não foi possível falar com o servidor. Verifique sua conexão.');
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const body = (payload ?? {}) as ApiErrorBody;
    const code = typeof body.code === 'string' ? body.code : 'INTERNAL_ERROR';
    const message =
      typeof body.message === 'string' && body.message.length > 0
        ? body.message
        : 'Não foi possível concluir a operação.';

    const error = new ApiError(response.status, code, message, body.details, body.requestId);
    if (error.isAuthError && !options.silentAuth) onUnauthenticated?.();
    throw error;
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query'], options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'GET', query }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'POST', body: body ?? {} }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'PATCH', body: body ?? {} }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'PUT', body: body ?? {} }),
  delete: <T>(path: string, options?: RequestOptions) => apiRequest<T>(path, { ...options, method: 'DELETE' }),
};

export function isErrorCode(error: unknown, code: ErrorCode): boolean {
  return error instanceof ApiError && error.code === code;
}

export function knownErrorCode(value: string): value is ErrorCode {
  return (ERROR_CODES as readonly string[]).includes(value);
}

/** Mensagem pronta para exibir, sem vazar detalhe técnico ao usuário. */
export function errorMessage(error: unknown, fallback = 'Não foi possível concluir a operação.'): string {
  if (error instanceof ApiError) {
    const issues = error.fieldIssues;
    if (issues.length > 0 && error.code === 'VALIDATION_FAILED') {
      return issues.map((i) => i.message).join(' ');
    }
    return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
