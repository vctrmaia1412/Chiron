'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { MobileNav } from '@/components/layout/mobile-nav';
import { Spinner } from '@/components/ui/primitives';
import { Logo } from '@/components/brand/logo';

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
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <Logo className="h-8" />
        <p className="text-sm text-[var(--ink-2)]">
          Sua conta não está vinculada a nenhuma organização ativa.
        </p>
        <p className="text-[13px] text-[var(--ink-3)]">Fale com o administrador da clínica.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="min-w-0 flex-1 px-4 pb-[calc(var(--mobilenav-h)+env(safe-area-inset-bottom)+16px)] pt-4 md:px-6 md:pt-6 lg:pb-10">
          {children}
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
