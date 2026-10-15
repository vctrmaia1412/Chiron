'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { MobileNav } from '@/components/layout/mobile-nav';
import { ActiveEncounterPill } from '@/components/clinical/active-encounter-pill';
import { Spinner } from '@/components/ui/primitives';
import { Logo } from '@/components/brand/logo';

/**
 * Sessão sem clínica ativa. Quem participa de mais de uma escolhe aqui (antes
 * caía numa tela sem saída dizendo que não tinha vínculo); quem não participa
 * de nenhuma vê o aviso e pode sair para entrar com outra conta.
 */
function NoActiveOrganization() {
  const { context, switchTenant, logout } = useSession();
  const [choosing, setChoosing] = useState<string | null>(null);
  const tenants = context?.availableTenants ?? [];

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Logo className="mb-6 h-8" />
        {tenants.length > 0 ? (
          <>
            <h1 className="text-lg font-semibold text-[var(--ink)]">Escolha a organização</h1>
            <p className="mt-1 text-sm text-[var(--ink-3)]">Você participa de mais de uma clínica.</p>
            <div className="mt-5 space-y-2">
              {tenants.map((tenant) => (
                <button
                  key={tenant.id}
                  type="button"
                  disabled={Boolean(choosing)}
                  onClick={async () => {
                    setChoosing(tenant.id);
                    try {
                      await switchTenant(tenant.id);
                    } finally {
                      setChoosing(null);
                    }
                  }}
                  className="flex w-full items-center justify-between rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-3 text-left transition-colors hover:border-[var(--brand)] hover:bg-[var(--brand-soft)] disabled:opacity-60"
                >
                  <span>
                    <span className="block text-sm font-medium text-[var(--ink)]">{tenant.name}</span>
                    <span className="block text-[13px] text-[var(--ink-3)]">
                      {tenant.facilities.length === 1 ? tenant.facilities[0]?.name : `${tenant.facilities.length} unidades`}
                    </span>
                  </span>
                  {choosing === tenant.id && <Spinner />}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-[var(--ink-2)]">Sua conta não está vinculada a nenhuma organização ativa.</p>
            <p className="mt-1 text-[13px] text-[var(--ink-3)]">Fale com o administrador da clínica.</p>
          </>
        )}
        <button
          type="button"
          onClick={() => void logout()}
          className="mt-6 text-sm font-medium text-[var(--brand)]"
        >
          Sair e entrar com outra conta
        </button>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { context, loading, error } = useSession();

  useEffect(() => {
    if (!loading && error instanceof ApiError && error.isAuthError) {
      router.replace('/entrar');
    }
  }, [loading, error, router]);

  if (loading || (!context && !error)) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
        <Logo className="h-8" />
        <Spinner />
      </div>
    );
  }

  if (!context) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <Logo className="h-8" />
        <p className="text-sm text-[var(--ink-3)]">Não foi possível carregar sua sessão.</p>
        <button
          type="button"
          onClick={() => router.replace('/entrar')}
          className="rounded-[var(--radius)] bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white"
        >
          Entrar novamente
        </button>
      </div>
    );
  }

  if (!context.tenant) {
    return <NoActiveOrganization />;
  }

  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="min-w-0 flex-1 px-4 pb-[calc(var(--mobilenav-h)+env(safe-area-inset-bottom)+16px)] pt-4 md:px-6 md:pt-6 lg:pb-10">
          {children}
          <ActiveEncounterPill />
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
