'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/primitives';

/**
 * Rede de segurança fora do painel. Sem este arquivo, qualquer exceção cai na
 * tela padrão do Next, em inglês e sem caminho de volta.
 */
export default function RootError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const apiError = error instanceof ApiError ? error : null;
  const reference = apiError?.requestId ?? error.digest;

  useEffect(() => {
    // Só a referência vai para o console: a mensagem pode citar paciente ou tutor.
    console.error('Falha na interface', reference ?? 'sem referência');
  }, [reference]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <Logo className="mb-8 h-8" />

      <Card className="w-full max-w-md px-6 py-8 text-center">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--danger-soft)] text-[var(--danger)]">
          <TriangleAlert className="h-6 w-6" aria-hidden />
        </span>

        <h1 className="text-[18px] font-semibold text-[var(--ink)]">Algo deu errado</h1>
        <p className="mt-2 text-sm text-[var(--ink-2)]">
          {apiError
            ? apiError.message
            : 'Não foi possível carregar esta tela. Nada do que já foi registrado se perdeu.'}
        </p>

        {reference && (
          <p className="mt-4 rounded-[var(--radius)] bg-[var(--surface-2)] px-3 py-2 text-[12.5px] text-[var(--ink-3)]">
            Informe este código ao suporte:{' '}
            <span className="tabular font-medium text-[var(--ink-2)]">{reference}</span>
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={() => retry()}>Tentar novamente</Button>
          <Button asChild variant="secondary">
            <Link href="/">Ir para o painel</Link>
          </Button>
        </div>
      </Card>
    </main>
  );
}
