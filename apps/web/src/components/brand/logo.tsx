import { cn } from '@/lib/cn';

/**
 * Marca própria: a letra C fechando sobre um traço de batimento. Sem
 * pata estilizada nem cruz vermelha, que é o clichê do segmento.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={cn('h-8 w-8', className)} aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--brand)" />
      <path
        d="M22.5 10.6A7.6 7.6 0 1 0 22.5 21.4"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M7.5 16h3.1l1.6-3.4 2.3 6.6 1.7-3.2h3.3"
        stroke="white"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function Logo({ className, showText = true }: { className?: string; showText?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark className="h-full w-auto aspect-square" />
      {showText && (
        <span className="text-[19px] font-semibold tracking-[0.14em] text-[var(--ink)]">CHIRON</span>
      )}
    </span>
  );
}
