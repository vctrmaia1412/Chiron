'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MeContext, ModuleKey, ModuleState } from '@chiron/contracts';
import { ApiError, api, setActiveTenantId, setUnauthenticatedHandler } from './api';

/**
 * Contexto de sessão do frontend. É espelho do que o servidor decidiu:
 * permissões e módulos vêm de /me/context e servem apenas para não mostrar
 * ação que seria negada. A autorização de verdade acontece no backend.
 */

interface SessionValue {
  context: MeContext | null;
  loading: boolean;
  error: unknown;
  can: (permission: string) => boolean;
  canAny: (...permissions: string[]) => boolean;
  moduleState: (module: ModuleKey) => ModuleState;
  hasModule: (module: ModuleKey) => boolean;
  refresh: () => Promise<void>;
  switchTenant: (tenantId: string) => Promise<void>;
  switchFacility: (facilityId: string | null) => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [expired, setExpired] = useState(false);

  const query = useQuery({
    queryKey: ['me-context'],
    queryFn: () => api.get<MeContext>('/me/context', undefined, { silentAuth: true }),
    retry: (failureCount, error) => {
      if (error instanceof ApiError && (error.isAuthError || error.isForbidden)) return false;
      return failureCount < 2;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const context = query.data ?? null;

  useEffect(() => {
    setActiveTenantId(context?.tenant?.id ?? null);
  }, [context?.tenant?.id]);

  useEffect(() => {
    setUnauthenticatedHandler(() => setExpired(true));
    return () => setUnauthenticatedHandler(null);
  }, []);

  useEffect(() => {
    if (!expired) return;
    setExpired(false);
    queryClient.clear();
    router.replace('/entrar?expirada=1');
  }, [expired, queryClient, router]);

  const permissions = useMemo(() => new Set(context?.permissions ?? []), [context?.permissions]);

  const can = useCallback((permission: string) => permissions.has(permission), [permissions]);

  const canAny = useCallback(
    (...list: string[]) => list.some((permission) => permissions.has(permission)),
    [permissions],
  );

  const moduleState = useCallback(
    (module: ModuleKey): ModuleState => (context?.modules?.[module] as ModuleState) ?? 'disabled',
    [context?.modules],
  );

  const hasModule = useCallback(
    (module: ModuleKey) => {
      const state = moduleState(module);
      return state === 'active' || state === 'trial' || state === 'suspended';
    },
    [moduleState],
  );

  const refresh = useCallback(async () => {
    await query.refetch();
  }, [query]);

  const switchTenant = useCallback(
    async (tenantId: string) => {
      await api.post('/me/context', { tenantId });
      queryClient.clear();
      await query.refetch();
      router.push('/');
    },
    [query, queryClient, router],
  );

  const switchFacility = useCallback(
    async (facilityId: string | null) => {
      await api.post('/me/context', { facilityId });
      queryClient.clear();
      await query.refetch();
    },
    [query, queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      queryClient.clear();
      setActiveTenantId(null);
      router.replace('/entrar');
    }
  }, [queryClient, router]);

  const value = useMemo<SessionValue>(
    () => ({
      context,
      loading: query.isLoading,
      error: query.error,
      can,
      canAny,
      moduleState,
      hasModule,
      refresh,
      switchTenant,
      switchFacility,
      logout,
    }),
    [context, query.isLoading, query.error, can, canAny, moduleState, hasModule, refresh, switchTenant, switchFacility, logout],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession precisa estar dentro de SessionProvider.');
  return value;
}

/** Atalho para o contexto já carregado, em telas que só renderizam autenticadas. */
export function useTenantContext(): MeContext {
  const { context } = useSession();
  if (!context) throw new Error('Contexto da organização ainda não carregado.');
  return context;
}
