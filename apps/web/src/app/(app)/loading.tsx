import { Skeleton } from '@/components/ui/primitives';

/**
 * Espera do painel: mesmo esqueleto das listas, no lugar onde o conteúdo vai
 * aparecer, para a tela não saltar quando os dados chegam.
 */
export default function AppLoading() {
  return (
    <div role="status" aria-label="Carregando" className="space-y-4">
      <div className="mb-4 space-y-2 md:mb-6">
        <Skeleton className="h-7 w-56 max-w-full" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>

      <Skeleton className="h-44 w-full" />
      <Skeleton className="h-44 w-full" />
    </div>
  );
}
