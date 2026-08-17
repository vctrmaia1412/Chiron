import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/primitives';

/** URL errada ou registro removido: em português e com saída para o painel. */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <Logo className="mb-8 h-8" />

      <Card className="w-full max-w-md px-6 py-8 text-center">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--ink-3)]">
          <SearchX className="h-6 w-6" aria-hidden />
        </span>

        <h1 className="text-[18px] font-semibold text-[var(--ink)]">Página não encontrada</h1>
        <p className="mt-2 text-sm text-[var(--ink-2)]">
          O endereço acessado não existe ou o registro foi removido. Confira o link e tente de novo.
        </p>

        <div className="mt-6">
          <Button asChild>
            <Link href="/">Ir para o painel</Link>
          </Button>
        </div>
      </Card>
    </main>
  );
}
