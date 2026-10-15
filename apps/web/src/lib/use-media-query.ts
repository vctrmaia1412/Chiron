'use client';

import { useSyncExternalStore } from 'react';

/**
 * Consulta de mídia lida sem efeito: no servidor vale `fallback`, no
 * navegador vale a tela de verdade e acompanha rotação e redimensionamento.
 */
export function useMediaQuery(query: string, fallback = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => fallback,
  );
}

/** Mesma quebra do layout (`lg` do Tailwind): coluna lateral e navegação de computador. */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)');
}
