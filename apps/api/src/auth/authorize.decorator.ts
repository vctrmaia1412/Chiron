import { SetMetadata, applyDecorators } from '@nestjs/common';
import type { ModuleKey } from '@chiron/contracts';

export const AUTHORIZE_KEY = 'chiron:authorize';
export const PUBLIC_KEY = 'chiron:public';
export const STEP_UP_KEY = 'chiron:step-up';
export const ALLOW_NO_TENANT_KEY = 'chiron:allow-no-tenant';

export interface AuthorizeMetadata {
  module: ModuleKey;
  permission: string;
}

/**
 * Declara explicitamente o módulo e a permissão de uma rota.
 * O módulo nunca é inferido do prefixo da URL: `/patients/:id/record`
 * pertence a `clinical`, embora a rota comece por `/patients`.
 */
export function Authorize(module: ModuleKey, permission: string) {
  return SetMetadata<string, AuthorizeMetadata>(AUTHORIZE_KEY, { module, permission });
}

/** Rota pública: sem sessão. Ainda passa pelo rate limit. */
export function Public() {
  return SetMetadata(PUBLIC_KEY, true);
}

/** Exige reautenticação recente (step-up) além da permissão. */
export function RequireStepUp() {
  return SetMetadata(STEP_UP_KEY, true);
}

/** Rota autenticada que funciona sem tenant ativo (escolha de organização). */
export function AllowNoTenant() {
  return SetMetadata(ALLOW_NO_TENANT_KEY, true);
}

/** Açúcar: autenticada, sem tenant obrigatório. */
export function AuthenticatedOnly() {
  return applyDecorators(AllowNoTenant());
}
