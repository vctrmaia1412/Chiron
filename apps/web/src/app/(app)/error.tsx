'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/primitives';

/**
 * Falha dentro do painel: o menu e a barra superior continuam de pé, só o
 * conteúdo é substituído. Assim o usuário sai daqui por onde quiser.
 */
export default function AppError({
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
    console.error('Falha na tela do painel', reference ?? 'sem referência');
  }, [reference]);

  return (
    <Card className="mx-auto max-w-lg px-6 py-10 text-center">
      <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--danger-soft)] text-[var(--danger)]">
        <TriangleAlert className="h-6 w-6" aria-hidden />
      </span>

      <h1 className="text-[17px] font-semibold text-[var(--ink)]">Não foi possível carregar esta tela</h1>
      <p className="mt-2 text-sm text-[var(--ink-2)]">
        {apiError ? apiError.message : 'Houve uma falha inesperada. Nada do que já foi registrado se perdeu.'}
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
  );
}
