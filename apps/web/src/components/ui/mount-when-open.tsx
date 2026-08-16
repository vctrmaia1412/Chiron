'use client';

/**
 * Formulário em folha só existe enquanto está aberto.
 *
 * Assim o estado nasce limpo a cada abertura, pelo inicializador do
 * `useState`, em vez de ser zerado por um efeito. Além de evitar renderização
 * em cascata, elimina a classe de bug em que o formulário reabre com resto do
 * preenchimento anterior.
 */
export function MountWhenOpen({ open, children }: { open: boolean; children: React.ReactNode }) {
  if (!open) return null;
  return <>{children}</>;
}
